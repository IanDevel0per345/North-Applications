from functions.emoji import emoji
from functions.database import database as db
import requests

def change_bio():
    database = db.obter("config.json")
    token = database["bot"]["token"]
    id = database["bot"]["id"]
    api_url = database["apiURL"]

    description = (
        f"{emoji.vision_1}{emoji.vision_2}{emoji.vision_3}{emoji.vision_4}{emoji.vision_5}{emoji.vision_6}{emoji.vision_7}\n"
        f"https://visionapplications.com.br"
    )
    
    url = f"https://discord.com/api/v9/applications/{id}"
    headers = {
        "authorization": f"Bot {token}",
        "content-type": "application/json",
    }
    payload = {
        "description": description
    }

    requests.patch(url, headers=headers, json=payload)
    return