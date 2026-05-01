"""
Sistema de logs de pedidos e eventos de compra
"""
import disnake
from disnake.ext import commands
from datetime import datetime
import io
from typing import Optional, List, Dict, Any
from functions.database import database as db
from functions.emoji import emoji
from functions.utils import utils


class PurchaseLogsSystem(commands.Cog):
    """Sistema de logs de pedidos e eventos de compra"""
    
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    @staticmethod
    def _get_mode_and_color() -> tuple:
        """Retorna o modo de exibição e cor padrão"""
        mode = db.get_document("custom_mode").get("mode", "embed")
        
        colors = db.get_document("custom_colors")
        primary_color_hex = colors.get("primary")
        
        color = None
        if primary_color_hex:
            try:
                primary_color = int(primary_color_hex.replace("#", ""), 16)
                color = disnake.Colour(primary_color)
            except:
                pass
        
        return mode, color
    
    @staticmethod
    def _create_stock_file(items: List[str]) -> disnake.File:
        """Cria um arquivo .txt com os itens do estoque"""
        content = "=== ITENS RECEBIDOS ===\n\n"
        for i, item in enumerate(items, 1):
            content += f"{i}. {item}\n"
        
        content += f"\n=== TOTAL: {len(items)} item(s) ===\n"
        content += f"Data: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n"
        
        file_buffer = io.BytesIO(content.encode('utf-8'))
        file_buffer.seek(0)
        return disnake.File(file_buffer, filename="estoque_recebido.txt")
    
    async def send_order_log(
        self,
        guild: disnake.Guild,
        user: disnake.User,
        product_name: str,
        campo_name: str,
        quantity: int,
        price: float,
        payment_method: str,
        items: Optional[List[str]] = None,
        delivery_type: str = "automatic",
        cart_id: Optional[str] = None
    ):
        """Envia log detalhado do pedido para o canal de logs de pedidos"""
        try:
            # Obter canal de logs
            canais = db.get_document("canais") or {}
            log_channel_id = canais.get("canal_de_logs_de_pedidos")
            
            if not log_channel_id:
                print(f"[LOG PEDIDOS] Canal de logs de pedidos não configurado")
                return
            
            try:
                channel = guild.get_channel(int(log_channel_id))
            except (ValueError, TypeError) as e:
                print(f"[LOG PEDIDOS] Erro ao converter channel_id: {log_channel_id} - {e}")
                return
            
            if not channel:
                print(f"[LOG PEDIDOS] Canal {log_channel_id} não encontrado no servidor")
                return
            
            mode, color = self._get_mode_and_color()
            
            # Formatar método de pagamento
            payment_methods_map = {
                "pix": "PIX",
                "card": "Cartão de Crédito",
                "crypto": "Criptomoeda"
            }
            payment_display = payment_methods_map.get(payment_method, payment_method.upper())
            
            # Formatar preço
            price_display = utils.format_price_brl(price)
            
            # Preparar arquivo de estoque se necessário
            stock_file = None
            stock_text = None
            
            if items:
                items_text = "\n".join([f"`{i+1}.` {item}" for i, item in enumerate(items)])
                if len(items_text) > 2000:
                    stock_file = self._create_stock_file(items)
                    stock_text = f"*Arquivo anexado com {len(items)} item(s)*"
                else:
                    stock_text = items_text
            
            if mode == "embed":
                # Criar embed
                embed = disnake.Embed(
                    title=f"{emoji.vision}\n-# Novo Pedido Realizado",
                    description=(
                        f"**Cliente:** {user.mention} (`{user.id}`)\n"
                        f"**Produto:** {product_name}\n"
                        f"**Campo:** {campo_name}\n"
                        f"**Quantidade:** {quantity}\n"
                        f"**Valor:** {price_display}\n"
                        f"**Método:** {payment_display}\n"
                        f"**Tipo de Entrega:** {'Manual' if delivery_type == 'manual' else 'Automática'}\n"
                        f"**ID do Pedido:** `{cart_id or 'N/A'}`"
                    ),
                    color=color or disnake.Color.green(),
                    timestamp=datetime.now()
                )
                
                embed.set_footer(
                    text=f"Pedido processado • {guild.name}",
                    icon_url=guild.icon.url if guild.icon else None
                )
                
                # Enviar mensagem do log primeiro
                log_message = await channel.send(embed=embed)
                
                # Se houver estoque entregue, sempre enviar arquivo .txt como resposta ao log
                if items and log_message:
                    try:
                        stock_file_reply = self._create_stock_file(items)
                        await log_message.reply(f"{emoji.cardbox} **Estoque Entregue:**", file=stock_file_reply)
                    except Exception as e:
                        print(f"[LOG PEDIDOS] Erro ao enviar resposta com estoque: {e}")
                
                print(f"[LOG PEDIDOS] Log enviado com sucesso para {channel.name} (embed)")
            
            else:
                # Criar container
                container_kwargs = {}
                if color:
                    container_kwargs["accent_colour"] = color
                
                # Construir lista de componentes do container (sem None)
                container_children = [
                    disnake.ui.TextDisplay(f"# {emoji.vision}\n-# Novo Pedido Realizado"),
                    disnake.ui.Separator(),
                    disnake.ui.TextDisplay(f"## {emoji.member} Cliente\n-# {user.mention} (`{user.id}`)"),
                    disnake.ui.Separator(),
                    disnake.ui.TextDisplay(
                        f"## {emoji.bag} Produto\n"
                        f"-# **Nome:** {product_name}\n"
                        f"-# **Campo:** {campo_name}\n"
                        f"-# **Quantidade:** `{quantity}`"
                    ),
                    disnake.ui.Separator(),
                    disnake.ui.TextDisplay(
                        f"## {emoji.dollar} Pagamento\n"
                        f"-# **Valor:** `{price_display}`\n"
                        f"-# **Método:** {payment_display}"
                    ),
                    disnake.ui.Separator(),
                    disnake.ui.TextDisplay(
                        f"## {emoji.truck if delivery_type == 'manual' else emoji.correct} Entrega\n"
                        f"-# **Tipo:** {'Manual' if delivery_type == 'manual' else 'Automática'}\n"
                        f"-# **ID do Pedido:** `{cart_id or 'N/A'}`"
                    )
                ]
                
                components = [
                    disnake.ui.Container(
                        *container_children,
                        **container_kwargs
                    )
                ]
                
                # Enviar mensagem do log primeiro
                log_message = await channel.send(
                    components=components,
                    flags=disnake.MessageFlags(is_components_v2=True)
                )
                
                # Se houver estoque entregue, sempre enviar arquivo .txt como resposta ao log
                if items and log_message:
                    try:
                        stock_file_reply = self._create_stock_file(items)
                        await log_message.reply(f"{emoji.cardbox} **Estoque Entregue:**", file=stock_file_reply)
                    except Exception as e:
                        print(f"[LOG PEDIDOS] Erro ao enviar resposta com estoque: {e}")
                
                print(f"[LOG PEDIDOS] Log enviado com sucesso para {channel.name} (container)")
        
        except Exception as e:
            print(f"[LOG PEDIDOS] Erro ao enviar log de pedido: {e}")
            import traceback
            traceback.print_exc()
    
    async def send_cart_created_log(
        self,
        guild: disnake.Guild,
        user: disnake.User,
        product_name: str,
        campo_name: str,
        quantity: int,
        price: float,
        payment_method: str,
        cart_url: str,
        cart_id: str
    ):
        """Envia log de criação de carrinho"""
        try:
            # Obter canal de logs
            canais = db.get_document("canais") or {}
            log_channel_id = canais.get("canal_de_logs_de_pedidos")
            
            if not log_channel_id:
                print(f"[LOG CARRINHO] Canal de logs de pedidos não configurado")
                return
            
            try:
                channel = guild.get_channel(int(log_channel_id))
            except (ValueError, TypeError) as e:
                print(f"[LOG CARRINHO] Erro ao converter channel_id: {log_channel_id} - {e}")
                return
            
            if not channel:
                print(f"[LOG CARRINHO] Canal {log_channel_id} não encontrado no servidor")
                return
            
            mode, color = self._get_mode_and_color()
            
            # Formatar método de pagamento
            payment_methods_map = {
                "pix": "PIX",
                "pix_manual": "PIX Manual",
                "card": "Cartão de Crédito",
                "crypto": "Criptomoeda",
                "mercado_pago": "Mercado Pago",
                "stripe": "Stripe",
                "paypal": "PayPal"
            }
            payment_display = payment_methods_map.get(payment_method, payment_method.upper())
            
            # Formatar preço
            price_display = utils.format_price_brl(price)
            
            if mode == "embed":
                embed = disnake.Embed(
                    title=f"Carrinho Criado",
                    description=(
                        f"**Cliente:** {user.mention} (`{user.id}`)\n"
                        f"**Produto:** {product_name}\n"
                        f"**Campo:** {campo_name}\n"
                        f"**Quantidade:** {quantity}\n"
                        f"**Valor:** {price_display}\n"
                        f"**Método:** {payment_display}\n"
                        f"**Status:** Aguardando Pagamento"
                    ),
                    color=disnake.Color.blue(),
                    timestamp=datetime.now()
                )
                
                embed.set_footer(
                    text=f"ID: {cart_id} • {guild.name}",
                    icon_url=guild.icon.url if guild.icon else None
                )
                
                components = [
                    disnake.ui.ActionRow(
                        disnake.ui.Button(
                            label="Abrir Carrinho",
                            style=disnake.ButtonStyle.link,
                            url=cart_url,
                            emoji=emoji.cart
                        )
                    )
                ]
                
                await channel.send(embed=embed, components=components)
                print(f"[LOG CARRINHO] Log de carrinho criado enviado para {channel.name} (embed)")
            
            else:
                container_kwargs = {}
                if color:
                    container_kwargs["accent_colour"] = color
                
                components = [
                    disnake.ui.Container(
                        disnake.ui.TextDisplay(f"# {emoji.vision}\n-# Carrinho Criado"),
                        disnake.ui.Separator(),
                        disnake.ui.TextDisplay(
                            f"**Cliente:** {user.mention}\n"
                            f"**Produto:** {product_name}\n"
                            f"**Campo:** {campo_name}\n"
                            f"**Quantidade:** `{quantity}`\n"
                            f"**Valor:** `{price_display}`\n"
                            f"**Método:** {payment_display}\n"
                            f"**Status:** Aguardando Pagamento"
                        ),
                        **container_kwargs
                    ),
                    disnake.ui.ActionRow(
                        disnake.ui.Button(
                            label="Abrir Carrinho",
                            style=disnake.ButtonStyle.link,
                            url=cart_url,
                            emoji=emoji.cart
                        )
                    )
                ]
                
                await channel.send(
                    components=components,
                    flags=disnake.MessageFlags(is_components_v2=True)
                )
                print(f"[LOG CARRINHO] Log de carrinho criado enviado para {channel.name} (container)")
        
        except Exception as e:
            print(f"[LOG CARRINHO] Erro ao enviar log de carrinho criado: {e}")
            import traceback
            traceback.print_exc()
    
    async def send_purchase_event(
        self,
        guild: disnake.Guild,
        user: disnake.User,
        product_name: str,
        campo_name: str,
        quantity: int,
        price: float,
        product_id: str
    ):
        """Envia evento público de compra"""
        try:
            # Obter canal de eventos
            canais = db.get_document("canais") or {}
            event_channel_id = canais.get("canal_de_evento_de_compras")
            
            if not event_channel_id:
                print(f"[LOG EVENTO] Canal de evento de compras não configurado")
                return
            
            try:
                channel = guild.get_channel(int(event_channel_id))
            except (ValueError, TypeError) as e:
                print(f"[LOG EVENTO] Erro ao converter channel_id: {event_channel_id} - {e}")
                return
            
            if not channel:
                print(f"[LOG EVENTO] Canal {event_channel_id} não encontrado no servidor")
                return
            
            # Obter informações do produto para criar link
            products = db.get_document("loja_products") or {}
            product = products.get(product_id, {})
            
            # Buscar mensagem do produto na estrutura messages (array)
            product_url = None
            product_messages = product.get("messages", [])
            if product_messages:
                # Pegar a mensagem mais recente
                latest_message = max(product_messages, key=lambda m: m.get("created_at", 0))
                product_message_id = latest_message.get("message_id")
                product_channel_id = latest_message.get("channel_id")
                product_guild_id = latest_message.get("guild_id")
                
                # Verificar se é do mesmo servidor
                if product_channel_id and product_message_id and product_guild_id == guild.id:
                    product_url = f"https://discord.com/channels/{guild.id}/{product_channel_id}"
            
            mode, color = self._get_mode_and_color()
            
            # Obter configurações de personalização do evento
            personalization = db.get_document("loja_personalization") or {}
            event_config = personalization.get("purchase_event", {})
            event_color = event_config.get("color")
            event_image = event_config.get("image")
            
            # Usar cor personalizada se configurada, senão usa verde padrão
            if event_color:
                try:
                    color = disnake.Colour(int(event_color.replace("#", ""), 16))
                except:
                    color = disnake.Color.green()
            else:
                color = disnake.Color.green()
            
            # Formatar preço
            price_display = utils.format_price_brl(price)
            
            if mode == "embed":
                embed = disnake.Embed(
                    title=f"Nova Compra",
                    description=(
                        f"{emoji.member} **Cliente:** {user.mention}\n"
                        f"{emoji.cart} **Produto:** `{product_name}` - `{campo_name}` - `{quantity}x`\n"
                        f"{emoji.coin} **Valor:** `{price_display}`"
                    ),
                    color=color or disnake.Color.green(),
                    timestamp=datetime.now()
                )
                
                # Adicionar imagem se configurada
                if event_image:
                    embed.set_thumbnail(url=event_image)
                
                embed.set_footer(
                    text=f"Obrigado pela compra! {emoji.gift} • {guild.name}",
                    icon_url=guild.icon.url if guild.icon else None
                )
                
                # Sempre adicionar botão se houver URL do produto
                components = []
                if product_url:
                    components = [
                        disnake.ui.ActionRow(
                            disnake.ui.Button(
                                label="Comprar Também",
                                style=disnake.ButtonStyle.link,
                                url=product_url
                            )
                        )
                    ]
                
                await channel.send(embed=embed, components=components if components else None)
                print(f"[LOG EVENTO] Evento de compra enviado para {channel.name} (embed)")
            
            else:
                # Modo Container
                container_kwargs = {}
                if color:
                    container_kwargs["accent_colour"] = color
                
                components = [
                    disnake.ui.Container(
                        disnake.ui.TextDisplay(f"# {emoji.sparkles}\n-# Nova Compra!"),
                        disnake.ui.Separator(),
                        disnake.ui.TextDisplay(
                            f"{emoji.member} **Cliente:** {user.mention}\n"
                            f"{emoji.cart} **Produto:** `{product_name}` - `{campo_name}` - `{quantity}x`\n"
                            f"{emoji.coin} **Valor:** `{price_display}`"
                        ),
                        **container_kwargs
                    )
                ]
                
                # Sempre adicionar botão se houver URL do produto
                if product_url:
                    components.append(
                        disnake.ui.ActionRow(
                            disnake.ui.Button(
                                label="Comprar Também",
                                style=disnake.ButtonStyle.link,
                                url=product_url
                            )
                        )
                    )
                
                await channel.send(
                    components=components,
                    flags=disnake.MessageFlags(is_components_v2=True)
                )
                print(f"[LOG EVENTO] Evento de compra enviado para {channel.name} (container)")
        
        except Exception as e:
            print(f"[LOG EVENTO] Erro ao enviar evento de compra: {e}")
            import traceback
            traceback.print_exc()


def setup(bot: commands.Bot):
    bot.add_cog(PurchaseLogsSystem(bot))
