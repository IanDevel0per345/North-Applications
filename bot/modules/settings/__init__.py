from .cog import Settings
from .cargos import setup as cargos_setup
from .canais import setup as canais_setup
from .payments import setup as payments_setup
from .antifake import setup as antifake_setup
from .extensions.cog import setup as extensions_panel_setup
from .extensions.boost.cog import setup as boost_setup

def setup(bot):
    bot.add_cog(Settings(bot))
    cargos_setup(bot)
    canais_setup(bot)
    payments_setup(bot)
    antifake_setup(bot)
    extensions_panel_setup(bot)
    boost_setup(bot)

__all__ = ["setup"]