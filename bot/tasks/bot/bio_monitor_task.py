from disnake.ext import tasks
import asyncio
import requests
import sys
from requests.exceptions import ConnectionError as RequestsConnectionError, Timeout, RequestException
from urllib3.exceptions import NameResolutionError, NewConnectionError
from functions.database import database as db
from functions.emoji import emoji
import core

def is_network_error(error: Exception) -> bool:
    """Verifica se o erro é relacionado a problemas de rede/DNS."""
    error_str = str(error).lower()
    error_type = type(error).__name__
    
    # Verificar tipos de erro de rede
    network_error_types = (
        RequestsConnectionError,
        Timeout,
        NameResolutionError,
        NewConnectionError,
        RequestException,
        OSError  # getaddrinfo failed é OSError
    )
    
    if isinstance(error, network_error_types):
        return True
    
    # Verificar mensagens de erro comuns de rede
    network_error_messages = [
        'getaddrinfo failed',
        'name resolution',
        'connection closed',
        'max retries exceeded',
        'cannot connect to host',
        'connection refused',
        'network is unreachable',
        'timeout',
        'connection pool',
        'ssl:default',
        'failed to resolve'
    ]
    
    return any(msg in error_str for msg in network_error_messages)

def get_expected_bio():
    """Retorna a bio esperada do bot."""
    description = (
        f"{emoji.vision_1}{emoji.vision_2}{emoji.vision_3}{emoji.vision_4}{emoji.vision_5}{emoji.vision_6}{emoji.vision_7}\n"
        f"https://visionapplications.com.br"
    )
    return description

def get_current_bio(token: str, app_id: str) -> tuple[str, bool]:
    """
    Obtém a bio atual do bot via API do Discord.
    Retorna (bio, is_network_error) onde is_network_error indica se houve erro de rede.
    """
    try:
        url = f"https://discord.com/api/v9/applications/{app_id}"
        headers = {
            "authorization": f"Bot {token}",
            "content-type": "application/json",
        }
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return (data.get("description", ""), False)
        return ("", False)
    except Exception as e:
        is_net_error = is_network_error(e)
        if is_net_error:
            print(f"⚠️ Erro de rede ao obter bio atual (ignorando): {e}")
        else:
            print(f"Erro ao obter bio atual: {e}")
        return ("", is_net_error)

def correct_bio() -> tuple[bool, bool]:
    """
    Corrige a bio do bot para o valor esperado.
    Retorna (success, is_network_error) onde is_network_error indica se houve erro de rede.
    """
    try:
        core.change_bio()
        return (True, False)
    except Exception as e:
        is_net_error = is_network_error(e)
        if is_net_error:
            print(f"⚠️ Erro de rede ao corrigir bio (ignorando): {e}")
        else:
            print(f"Erro ao corrigir bio: {e}")
        return (False, is_net_error)

async def send_alert_dm(bot, user_id: int, current_bio: str, expected_bio: str):
    """Envia uma DM de alerta para um usuário."""
    try:
        user = await bot.fetch_user(user_id)
        if user:
            message = (
                f"# ALERTA\n"
                f"A bio do bot foi alterada por um script externo!\n"
                f"**Bio atual:**\n{current_bio}\n\n"
                f"**Bio esperada:**\n{expected_bio}\n\n"
                f"-# O bot será desligado automaticamente para proteção."
            )
            await user.send(message)
    except Exception as e:
        print(f"Erro ao enviar DM para {user_id}: {e}")

async def shutdown_bot(bot):
    """Desliga o bot de forma segura."""
    try:
        print("⚠️ Desligando o bot devido a alteração não autorizada da bio...")
        await bot.close()
        sys.exit(1)
    except Exception as e:
        print(f"Erro ao desligar bot: {e}")
        sys.exit(1)

# Contador de tentativas de correção consecutivas
correction_attempts = 0
max_correction_attempts = 3  # Número máximo de tentativas antes de desligar

# Variável global para armazenar a referência do bot
_bot_instance = None

@tasks.loop(minutes=1)
async def bio_monitor_task(bot):
    """Monitora e corrige a bio do bot a cada 1 minuto se estiver diferente."""
    global correction_attempts, _bot_instance
    _bot_instance = bot
    
    try:
        database = db.obter("config.json")
        token = database["bot"]["token"]
        app_id = database["bot"]["id"]
        owner_id = int(database["bot"]["owner"])
        perms_ids = [int(perm_id) for perm_id in database["bot"]["perms"]]
        
        # Obtém a bio atual e esperada
        expected_bio = get_expected_bio()
        loop = asyncio.get_event_loop()
        current_bio, bio_network_error = await loop.run_in_executor(None, get_current_bio, token, app_id)
        
        # Se houve erro de rede ao obter a bio, não fazer nada (não incrementar contador)
        if bio_network_error:
            print("⚠️ Erro de rede ao verificar bio - pulando verificação desta vez")
            return  # Não incrementa contador, não desliga bot
        
        # Se não conseguiu obter a bio por outro motivo (não rede), também pular
        if not current_bio:
            print("⚠️ Não foi possível obter a bio atual - pulando verificação desta vez")
            return
        
        # Compara as bios (remove espaços em branco extras para comparação)
        if current_bio.strip() != expected_bio.strip():
            print(f"⚠️ ALERTA: Bio foi alterada! Atual: {current_bio[:50]}... Esperada: {expected_bio[:50]}...")
            
            # Tenta corrigir a bio automaticamente
            print(f"Tentando corrigir a bio (tentativa {correction_attempts + 1}/{max_correction_attempts})...")
            success, correction_network_error = await loop.run_in_executor(None, correct_bio)
            
            if success:
                correction_attempts = 0  # Reset contador se correção foi bem-sucedida
                print("✅ Bio corrigida com sucesso!")
            else:
                # Se foi erro de rede ao corrigir, não incrementar contador
                if correction_network_error:
                    print("⚠️ Erro de rede ao corrigir bio - não incrementando contador de tentativas")
                    return  # Não incrementa contador, não desliga bot
                
                # Apenas incrementar contador se não foi erro de rede
                correction_attempts += 1
                print(f"❌ Falha ao corrigir bio. Tentativas: {correction_attempts}/{max_correction_attempts}")
                
                # Se excedeu o número máximo de tentativas, envia alertas e desliga
                # IMPORTANTE: Só desliga se realmente conseguiu verificar que a bio está diferente
                # e não conseguiu corrigir por problemas de autenticação/permissão (não por rede)
                if correction_attempts >= max_correction_attempts:
                    print("🚨 Número máximo de tentativas de correção atingido. Enviando alertas...")
                    
                    # Envia alertas para o dono e todos os perms
                    all_users = [owner_id] + perms_ids
                    for user_id in all_users:
                        try:
                            await send_alert_dm(bot, user_id, current_bio, expected_bio)
                            await asyncio.sleep(0.5)  # Pequeno delay entre envios
                        except Exception as e:
                            print(f"Erro ao enviar alerta para {user_id}: {e}")
                    
                    # Desliga o bot após um pequeno delay para garantir que as DMs foram enviadas
                    await asyncio.sleep(2)
                    await shutdown_bot(bot)
        else:
            # Bio está correta, reseta o contador
            if correction_attempts > 0:
                correction_attempts = 0
                print("✅ Bio verificada e está correta!")
            
    except Exception as e:
        # Verificar se é erro de rede
        if is_network_error(e):
            print(f"⚠️ Erro de rede no monitoramento de bio (ignorando): {e}")
        else:
            print(f"Erro no monitoramento de bio: {e}")

@bio_monitor_task.before_loop
async def before_bio_monitor_task():
    """Aguarda o bot estar pronto antes de iniciar a task."""
    if _bot_instance:
        await _bot_instance.wait_until_ready()

