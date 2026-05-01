import disnake
from disnake.ext import commands
import os
import core
import asyncio
from datetime import datetime
from functions.utils import utils
from functions.database import database as db

class OnLoad(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._checked_pending_carts = False
        self._websocket_initialized = False
        self._on_ready_processing = False
        self._last_ready_time = 0
        self._on_ready_once = False

    @commands.Cog.listener("on_ready")
    async def on_load(self):
        import time
        
        # Proteção contra execução duplicada do on_ready
        current_time = time.time()
        time_since_last_ready = current_time - self._last_ready_time
        
        # Se já executou uma vez, evitar reprocessar completamente
        if self._on_ready_once:
            return
        
        # Se já está processando ou foi chamado há menos de 5 segundos, ignorar
        if self._on_ready_processing or time_since_last_ready < 5:
            return
        
        self._on_ready_processing = True
        self._last_ready_time = current_time
        
        try:
            # os.system("cls") if os.name == "nt" else os.system("clear")
            try: servidor_principal = self.bot.get_guild(utils.obter_server_principal())
            except: servidor_principal = None

            print()
            print(f"Conectado em {self.bot.user.name} | {self.bot.user.id}")
            print(f"Servidores: {len(self.bot.guilds)}")
            print(f"Usuários: {sum(len(guild.members) for guild in self.bot.guilds)}")
            print(f"Servidor principal: {servidor_principal.name}") if servidor_principal else print("    [ ! ] Servidor principal: Não encontrado")
            print(f"Latência: {round(self.bot.latency * 1000)}ms")

            await core.change_status(self.bot)
            await core.log_restart(self.bot)

            # Inicializar WebSocket do Cloud apenas uma vez
            if not self._websocket_initialized:
                self._websocket_initialized = True
                asyncio.create_task(self._initialize_cloud_websocket())
                asyncio.create_task(self._initialize_boost_websocket())
            
            # Verificar carrinhos pendentes apenas uma vez
            if not self._checked_pending_carts:
                self._checked_pending_carts = True
                asyncio.create_task(self._check_pending_carts())
            
            # Marcar que já executou uma vez
            self._on_ready_once = True
        finally:
            # Liberar flag após um pequeno delay para evitar execuções muito próximas
            await asyncio.sleep(1)
            self._on_ready_processing = False
    
    async def _initialize_cloud_websocket(self):
        """Inicializa e mantém o WebSocket do Cloud conectado"""
        try:
            # Aguardar um pouco para garantir que o bot está totalmente pronto
            await asyncio.sleep(3)
            
            # Definir instância do bot globalmente
            from modules.cloud.update_api import set_bot_instance, get_websocket_manager, register_websocket_callbacks
            set_bot_instance(self.bot)
            
            # Obter configuração
            config = db.obter("configs/config_websocket.json")
            websocket_config = config.get("websocket_cloud", {})
            
            # Obter gerenciador WebSocket
            ws_manager = get_websocket_manager()
            ws_manager.set_bot(self.bot)
            
            # Registrar callbacks antes de conectar
            register_websocket_callbacks()
            
            # Verificar se já está conectado
            if ws_manager.is_connected():
                asyncio.create_task(self._websocket_health_check())
                return
            
            # Iniciar conexão em background
            await ws_manager.start()
            
            # Aguardar conexão ser estabelecida (máximo 10 segundos)
            for i in range(20):
                await asyncio.sleep(0.5)
                if ws_manager.is_connected():
                    print("[VisionCloud] ✅ Conectado com sucesso!")
                    await ws_manager.resend_bot_connected()
                    break
            else:
                print("[VisionCloud] ⚠️ Conexão em andamento (background)")
            
            # Iniciar health check periódico
            asyncio.create_task(self._websocket_health_check())
            
        except Exception as e:
            print(f"[VisionCloud] Erro: {e}")
            
            # Tentar novamente após 30 segundos
            await asyncio.sleep(30)
            asyncio.create_task(self._initialize_cloud_websocket())
    
    async def _initialize_boost_websocket(self):
        """Inicializa e mantém o WebSocket do Boost conectado"""
        try:
            # Aguardar um pouco para garantir que o bot está totalmente pronto
            await asyncio.sleep(5)
            
            from modules.settings.extensions.boost.websocket_manager import get_websocket_manager
            
            # Obter gerenciador WebSocket do Boost
            boost_ws_manager = get_websocket_manager()
            boost_ws_manager.set_bot(self.bot)
            
            # Verificar se já está conectado
            if boost_ws_manager.is_connected():
                print("[VisionBoost] ✅ Já conectado!")
                return
            
            # Iniciar conexão em background
            await boost_ws_manager.start()
            
            # Aguardar conexão ser estabelecida
            for i in range(20):
                await asyncio.sleep(0.5)
                if boost_ws_manager.is_connected():
                    print("[VisionBoost] ✅ Conectado com sucesso!")
                    break
            else:
                print("[VisionBoost] ⚠️ Conexão em andamento (background)")
            
        except Exception as e:
            print(f"[VisionBoost] Erro: {e}")
            
            # Tentar novamente após 30 segundos
            await asyncio.sleep(30)
            asyncio.create_task(self._initialize_boost_websocket())
    
    async def _websocket_health_check(self):
        """Verifica periodicamente o status da conexão WebSocket e reconecta se necessário"""
        try:
            from modules.cloud.update_api import get_websocket_manager, register_websocket_callbacks
            
            check_interval = 30  # Verificar a cada 30 segundos
            consecutive_failures = 0
            max_consecutive_failures = 3
            
            while True:
                await asyncio.sleep(check_interval)
                
                try:
                    ws_manager = get_websocket_manager()
                    
                    if not ws_manager.is_connected():
                        consecutive_failures += 1
                        
                        if consecutive_failures >= max_consecutive_failures:
                            print("[VisionCloud] Reconectando...")
                            
                            # Tentar parar conexão antiga
                            try:
                                await ws_manager.stop()
                                await asyncio.sleep(2)
                            except:
                                pass
                            
                            # Re-registrar callbacks
                            register_websocket_callbacks()
                            
                            # Tentar reconectar
                            await ws_manager.start()
                            await asyncio.sleep(3)
                            
                            if ws_manager.is_connected():
                                consecutive_failures = 0
                    else:
                        # Conexão OK
                        consecutive_failures = 0
                            
                except Exception as check_error:
                    consecutive_failures += 1
                    
        except Exception as e:
            print(f"[VisionCloud] ❌ Erro no health check: {e}")

    async def _check_pending_carts(self):
        """Verifica todos os carrinhos pendentes, checa status dos pagamentos e reinicia monitoramento"""
        try:
            await asyncio.sleep(5)  # Aguardar um pouco para garantir que tudo está carregado
            
            loja_data = db.get_document("loja_data")
            carts = loja_data.get("carts", {})
            
            pending_count = 0
            approved_count = 0
            failed_count = 0
            
            for cart_id, cart in carts.items():
                status = cart.get("status", "cart")
                
                # Verificar apenas carrinhos em status "pending" (aguardando pagamento)
                if status == "pending":
                    payment_data = cart.get("payment_data", {})
                    
                    # Verificar se tem dados de pagamento
                    if payment_data:
                        # Tentar nova estrutura primeiro
                        provider_data = payment_data.get("provider", {})
                        payment_provider = provider_data.get("name") or payment_data.get("payment_provider")
                        
                        # Extrair payment_id
                        payment_id = None
                        if provider_data:
                            payment_id = (
                                provider_data.get("payment_id") or 
                                provider_data.get("correlation_id") or
                                provider_data.get("charge_id") or
                                provider_data.get("txid")
                            )
                        
                        # Fallback para estrutura antiga
                        if not payment_id:
                            payment_ids = payment_data.get("payment_ids", {})
                            if payment_ids:
                                payment_id = (
                                    payment_ids.get("payment_id") or
                                    payment_ids.get("id") or
                                    payment_ids.get("txid") or
                                    payment_ids.get("payment_intent")
                                )
                        
                        # Tentar extrair do raw se ainda não encontrou
                        if not payment_id:
                            raw_data = payment_data.get("raw", {}) or provider_data.get("raw_response", {})
                            if raw_data:
                                payment_id = (
                                    raw_data.get("transactionId") or
                                    raw_data.get("paymentId") or
                                    raw_data.get("payment_id") or
                                    raw_data.get("id") or
                                    raw_data.get("txid") or
                                    raw_data.get("externalId")
                                )
                        
                        payment_method = cart.get("payment_method")
                        is_free_purchase = cart.get("is_free_purchase", False)
                        
                        # Se tem payment_id e não é compra gratuita, verificar status imediatamente
                        if payment_id and not is_free_purchase and payment_method:
                            try:
                                from modules.loja.cart.checkout import _check_single_payment_status, _handle_payment_approved
                                
                                # Verificar status do pagamento
                                is_finished, final_status = await _check_single_payment_status(
                                    cart_id=cart_id,
                                    payment_id=payment_id,
                                    payment_method=payment_method,
                                    payment_provider=payment_provider,
                                    bot=self.bot
                                )
                                
                                if is_finished:
                                    if final_status == "approved":
                                        # Pagamento aprovado - processar imediatamente
                                        print(f"[Cart Monitor] ✅ Pagamento aprovado para carrinho {cart_id}, processando...")
                                        await _handle_payment_approved(cart_id, self.bot)
                                        approved_count += 1
                                    else:
                                        # Pagamento falhou - atualizar status
                                        print(f"[Cart Monitor] ❌ Pagamento falhou para carrinho {cart_id}: {final_status}")
                                        cart["status"] = final_status
                                        cart["updated_at"] = int(datetime.utcnow().timestamp())
                                        loja_data["carts"][cart_id] = cart
                                        db.save_document("loja_data", loja_data)
                                        failed_count += 1
                                else:
                                    # Ainda pendente - reiniciar monitoramento
                                    print(f"[Cart Monitor] ⏳ Pagamento ainda pendente para carrinho {cart_id}, reiniciando monitoramento...")
                                    
                                    # Extrair payment_ids para o monitoramento
                                    from modules.loja.cart.checkout import _extract_payment_ids
                                    payment_ids_dict = {}
                                    if provider_data:
                                        if provider_data.get("payment_id"):
                                            payment_ids_dict["payment_id"] = provider_data.get("payment_id")
                                        if provider_data.get("correlation_id"):
                                            payment_ids_dict["correlationID"] = provider_data.get("correlation_id")
                                        if provider_data.get("charge_id"):
                                            payment_ids_dict["charge_id"] = provider_data.get("charge_id")
                                        if provider_data.get("txid"):
                                            payment_ids_dict["txid"] = provider_data.get("txid")
                                    
                                    if not payment_ids_dict and raw_data:
                                        payment_ids_dict = _extract_payment_ids(raw_data)
                                    
                                    if payment_ids_dict:
                                        from modules.loja.cart.checkout import _monitor_payment
                                        asyncio.create_task(_monitor_payment(cart_id, payment_method, payment_ids_dict, payment_provider, self.bot))
                                        pending_count += 1
                                    
                            except Exception as e:
                                print(f"[Cart Monitor] Erro ao verificar carrinho {cart_id}: {e}")
                                import traceback
                                traceback.print_exc()
                                
                                # Mesmo com erro, tentar reiniciar monitoramento
                                try:
                                    from modules.loja.cart.checkout import _extract_payment_ids, _monitor_payment
                                    raw_data = payment_data.get("raw", {}) or provider_data.get("raw_response", {})
                                    payment_ids_dict = _extract_payment_ids(raw_data) if raw_data else {}
                                    if payment_ids_dict:
                                        asyncio.create_task(_monitor_payment(cart_id, payment_method, payment_ids_dict, payment_provider, self.bot))
                                        pending_count += 1
                                except:
                                    pass
            
            print(f"[Cart Monitor] Verificação concluída: Aprovados: {approved_count} | Falhados: {failed_count} | Ainda pendentes: {pending_count}")
        except Exception as e:
            print(f"[Cart Monitor] Erro ao verificar carrinhos pendentes: {e}")
            import traceback
            traceback.print_exc()

def setup(bot: commands.Bot):
    bot.add_cog(OnLoad(bot))