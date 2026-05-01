import json
import os

EMOJIS_DB = "database/emojis/emojis.json"

def load_emojis():
    if os.path.exists(EMOJIS_DB):
        with open(EMOJIS_DB, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(f"[EmojiDatabase] Carregados {len(data)} emojis do banco de dados")
            return data
    print("[EmojiDatabase] Banco de dados de emojis não encontrado, retornando dicionário vazio")
    return {}

def save_emojis(data):
    with open(EMOJIS_DB, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)