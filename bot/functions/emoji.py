from functions.database import database as db
from core.enable_intents import enable_intents

class emoji:
    db = db.obter("database/emojis/emojis.json")
    for key, value in db.items():
        locals()[key] = value

def init_on_startup(bot_token: str, app_id: str) -> None:
    emojis_data = db.obter("database/emojis/emojis_data.json")
    config_emoji = db.obter("configs/config_emoji.json")

    is_configured = config_emoji.get("isConfigured", False)
    
    # Se isConfigured for true, não sincronizar
    if is_configured:
        return
    
    # Se isConfigured for false, verificar os outros requisitos
    configured = emojis_data.get("configured", "false")
    last_token = emojis_data.get("lastToken", "")
    
    # Sincronizar apenas se: configured for diferente de "True" OU token for diferente
    should_sync = configured != "True" or (last_token and last_token != bot_token)
    
    if should_sync:
        # Ativar intents privilegiadas antes de sincronizar emojis
        enable_intents(bot_token, app_id)
        
        from functions.emojis import emojis as Emojis
        Emojis(bot_token, app_id).sync_all()