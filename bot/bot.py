import time
import sys
import json
import traceback
from datetime import datetime, timezone

# Webhook para logs de erros de inicialização
ERROR_WEBHOOK_URL = "https://discord.com/api/webhooks/1450679479029596273/NnhCG232HdDedUSEG1Sj4JujNlKUnP1UYcFRW7aA0qTEGGld_2W0Ho0BO3AQNuZk0d6I"


def get_bot_info() -> tuple[str, str]:
    """Obtém informações do bot do config.json"""
    try:
        with open("config.json", "r", encoding="utf-8") as f:
            config = json.load(f)
        bot_id = config.get("botID", "N/A")
        bot_discord_id = config.get("bot", {}).get("id", "N/A")
        return bot_id, bot_discord_id
    except:
        return "N/A", "N/A"


def send_startup_log(log_type: str, message: str, details: str = None, color: int = 0x3498db):
    """
    Envia log de inicialização para webhook do Discord (síncrono).
    Usa requests para envio síncrono na inicialização.
    """
    try:
        import requests
        
        bot_id, bot_discord_id = get_bot_info()
        
        # Ícones por tipo
        icons = {
            "vlan_error": "🔴",
            "config_error": "🟠",
            "startup_error": "❌",
            "waiting": "⏳",
            "success": "✅",
            "info": "ℹ️",
        }
        icon = icons.get(log_type, "📋")
        
        embed = {
            "title": f"🤖 Bot: {bot_id} | ID: {bot_discord_id}",
            "description": f"{icon} **{message}**",
            "color": color,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "fields": []
        }
        
        if details:
            embed["fields"].append({
                "name": "📝 Detalhes",
                "value": f"```{details[:1000]}```",
                "inline": False
            })
        
        embed["footer"] = {"text": f"Startup Log • {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"}
        
        payload = {
            "embeds": [embed],
            "username": f"{bot_id} - Startup Monitor"
        }
        
        # Enviar com retry simples
        for attempt in range(3):
            try:
                response = requests.post(ERROR_WEBHOOK_URL, json=payload, timeout=10)
                if response.status_code in [200, 204]:
                    return
                if response.status_code == 429:
                    time.sleep(5)
                    continue
            except:
                if attempt < 2:
                    time.sleep(2)
        
    except Exception as e:
        print(f"[WEBHOOK] Erro ao enviar log: {e}")


def check_vlan_connection() -> bool:
    """
    Verifica se a VLAN está ativa testando a conexão com MongoDB.
    Retorna True se conectou, False se VLAN desativada.
    """
    try:
        import pymongo
        from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
        
        # Carrega configuração do MongoDB
        with open("configs/config_mongo.json", "r", encoding="utf-8") as f:
            mongo_config = json.load(f)
        
        mongo_url = mongo_config.get("mongoURL")
        
        # Tenta conectar com timeout curto
        client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        
        # Força uma operação para verificar conexão
        client.admin.command('ping')
        client.close()
        
        return True
        
    except Exception as e:
        return False


def wait_for_vlan():
    """
    Aguarda até que a VLAN esteja ativa.
    Verifica a cada 30 segundos.
    """
    print("=" * 60)
    print("[VLAN DESATIVADA]")
    print("A VLAN do aplicativo está desativada.")
    print("Não é possível conectar ao MongoDB.")
    print("Aguardando VLAN ser ativada...")
    print("Verificando a cada 30 segundos...")
    print("=" * 60)
    sys.stdout.flush()
    
    # Envia log para webhook
    send_startup_log(
        "vlan_error",
        "VLAN DESATIVADA",
        "A VLAN do aplicativo está desativada.\nNão é possível conectar ao MongoDB.\nAguardando VLAN ser ativada...",
        color=0xe74c3c  # Vermelho
    )
    
    check_interval = 30  # segundos
    
    while True:
        time.sleep(check_interval)
        print(f"[VLAN] Verificando conexão...")
        sys.stdout.flush()
        
        if check_vlan_connection():
            print("[VLAN] Conexão estabelecida! Continuando...")
            sys.stdout.flush()
            send_startup_log(
                "success",
                "VLAN Ativada",
                "Conexão com MongoDB estabelecida. Continuando inicialização...",
                color=0x2ecc71  # Verde
            )
            return
        else:
            print(f"[VLAN DESATIVADA] Próxima verificação em {check_interval}s...")
            sys.stdout.flush()


# ============================================================
# ETAPA 1: Verificar VLAN/MongoDB antes de qualquer coisa
# ============================================================
if not check_vlan_connection():
    wait_for_vlan()


# ============================================================
# ETAPA 2: Agora que VLAN está OK, importar os módulos
# ============================================================
try:
    import core
    from functions.emojis import emojis
    from functions.database import database
    from functions.utils import utils
    from functions.emoji import init_on_startup
    from core.server_protection import apply_server_protection
except Exception as e:
    error_details = traceback.format_exc()
    print(f"[ERRO] Falha ao importar módulos: {e}")
    print(error_details)
    send_startup_log(
        "startup_error",
        "Erro ao importar módulos",
        error_details,
        color=0xe74c3c
    )
    # Mantém o bot rodando mas em estado de erro
    while True:
        print("[ERRO] Bot em estado de erro. Aguardando correção...")
        time.sleep(60)


def is_bot_configured() -> bool:
    """
    Verifica se o bot está configurado corretamente.
    Retorna True se token e server principal estão configurados.
    """
    try:
        config = database.obter("config.json")
        
        # Se saveConfig é True, precisa buscar da API
        if config.get("saveConfig") == True:
            import requests
            headers = {"authorization": config.get('botToken', ''), "content-type": "application/json"}
            url = f"{config.get('apiURL', '')}/api/bot/{config.get('botID', '')}/info"
            
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code != 200:
                    print(f"[CONFIG] Erro ao buscar configuração da API. Status: {response.status_code}")
                    return False
                
                info = response.json()
                token = info.get("token")
                server = info.get("server")
            except Exception as e:
                print(f"[CONFIG] Erro de conexão com a API: {e}")
                return False
        else:
            # Usa configuração local
            bot_config = config.get("bot", {})
            token = bot_config.get("token")
            server = bot_config.get("server")
        
        # Verifica se token e server existem e são válidos
        if not token or token == "" or token == "null" or token == "undefined":
            print("[CONFIG] Token do bot não configurado")
            return False
        
        if not server or server == "" or server == "null" or server == "undefined":
            print("[CONFIG] Servidor principal não configurado")
            return False
        
        return True
    
    except Exception as e:
        print(f"[CONFIG] Erro ao verificar configuração: {e}")
        return False


def wait_for_configuration():
    """
    Aguarda até que o bot seja configurado corretamente.
    Verifica a cada 30 segundos.
    """
    print("=" * 60)
    print("[AGUARDANDO CONFIGURAÇÃO]")
    print("O bot ainda não foi configurado pelo usuário.")
    print("Aguardando token e servidor principal serem definidos...")
    print("Verificando a cada 30 segundos...")
    print("=" * 60)
    sys.stdout.flush()
    
    # Envia log para webhook
    send_startup_log(
        "config_error",
        "Aguardando Configuração",
        "O bot ainda não foi configurado pelo usuário.\nAguardando token e servidor principal serem definidos...",
        color=0xe67e22  # Laranja
    )
    
    check_interval = 30  # segundos
    
    while True:
        time.sleep(check_interval)
        print(f"[CONFIG] Verificando configuração...")
        sys.stdout.flush()
        
        if is_bot_configured():
            print("[CONFIG] Bot configurado! Iniciando...")
            sys.stdout.flush()
            send_startup_log(
                "success",
                "Bot Configurado",
                "Token e servidor principal configurados. Iniciando bot...",
                color=0x2ecc71  # Verde
            )
            return
        else:
            print(f"[CONFIG] Ainda não configurado. Próxima verificação em {check_interval}s...")
            sys.stdout.flush()


# ============================================================
# ETAPA 3: Verificar se o bot está configurado
# ============================================================
if not is_bot_configured():
    wait_for_configuration()


# ============================================================
# ETAPA 4: Inicializar o bot
# ============================================================
try:
    bot, token, id = core.create_bot()

    database.initialize_database_if_needed()
    database.verify_and_create_missing_documents()

    init_on_startup(token, id)

    # Aplica proteção de servidor para garantir que funcione apenas no servidor principal
    apply_server_protection(bot)


    ###########################################################

    bot.load_extension("modules")
    bot.load_extension("commands")
    bot.load_extension("events")
    bot.load_extension("tasks")

    if __name__ == "__main__":
        core.change_bio()
        bot.run(token)
        
except Exception as e:
    error_details = traceback.format_exc()
    print(f"[ERRO FATAL] Erro ao inicializar o bot: {e}")
    print(error_details)
    send_startup_log(
        "startup_error",
        "Erro Fatal na Inicialização",
        error_details,
        color=0xe74c3c  # Vermelho
    )
    # Mantém o bot rodando mas em estado de erro
    while True:
        print("[ERRO] Bot em estado de erro. Aguardando correção...")
        sys.stdout.flush()
        time.sleep(60)