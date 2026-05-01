from disnake.ext import commands
from .cog import Loja
from .products import setup as products_setup
from .cart import setup as cart_setup
from .logs import setup as logs_setup
from .personalization import setup as personalization_setup
from .clientes import setup as clientes_setup
from .preferences import setup as preferences_setup
from .saldo import setup as saldo_setup
from .cashback import setup as cashback_setup

def setup(bot: commands.Bot):
    bot.add_cog(Loja(bot))
    products_setup(bot)
    cart_setup(bot)
    logs_setup(bot)
    personalization_setup(bot)
    clientes_setup(bot)
    preferences_setup(bot)
    saldo_setup(bot)
    cashback_setup(bot)
    
__all__ = ["setup"]