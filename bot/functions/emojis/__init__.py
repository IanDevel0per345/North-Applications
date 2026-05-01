import os
import re
import sys
import asyncio
import aiohttp
import json
from .database import load_emojis, save_emojis
from .verify import verify_emojis_batch
from .upload import upload_emoji_async
from .delete import delete_emoji_async


class emojis:
    DB_PATH = "database/emojis/emojis.json"
    ASSETS_PATH = "database/emojis/assets"

    def __init__(self, bot_token: str, app_id: str):
        self.bot_token = bot_token
        self.app_id = app_id
        self.emojis_db = load_emojis()

    def get(self, name: str) -> str | None:
        return self.emojis_db.get(name)

    def list(self) -> dict:
        return self.emojis_db

    def save(self):
        save_emojis(self.emojis_db)

    def validate_name(self, name: str) -> bool:
        return 2 <= len(name) <= 32

    async def _list_guild_emojis_async(self, session: aiohttp.ClientSession):
        url = f"https://discord.com/api/v10/applications/{self.app_id}/emojis"
        headers = {"Authorization": f"Bot {self.bot_token}"}
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                return data.get("items", [])
        return []

    def emoji_name_exists(self, name: str, guild_emojis: list) -> bool:
        return any(e["name"] == name for e in guild_emojis)

    def get_emoji_id(self, name: str, guild_emojis: list) -> str | None:
        for emoji in guild_emojis:
            if emoji["name"] == name:
                return emoji["id"]
        return None

    async def validate_or_create_async(
        self, session: aiohttp.ClientSession, name: str, guild_emojis: list
    ) -> tuple[str | None, bool]:
        tag = self.emojis_db.get(name, "")
        create = False

        if not tag:
            create = True
        else:
            match = re.search(r"<a?:\w+:(\d+)>", tag)
            emoji_id = match.group(1) if match else None
            if emoji_id:
                # Verificação rápida inline
                verify_results = await verify_emojis_batch(
                    self.app_id, self.bot_token, [emoji_id]
                )
                if not verify_results.get(emoji_id, False):
                    await delete_emoji_async(session, self.app_id, self.bot_token, emoji_id)
                    create = True
                    self.emojis_db[name] = ""
            else:
                create = True

        if create:
            if not self.validate_name(name):
                return None, False

            if self.emoji_name_exists(name, guild_emojis):
                emoji_id = self.get_emoji_id(name, guild_emojis)
                if emoji_id:
                    await delete_emoji_async(
                        session, self.app_id, self.bot_token, emoji_id
                    )

            gif_path = os.path.join(self.ASSETS_PATH, f"{name}.gif")
            png_path = os.path.join(self.ASSETS_PATH, f"{name}.png")
            path = gif_path if os.path.isfile(gif_path) else png_path

            if not os.path.isfile(path):
                return None, False

            try:
                new_id = await upload_emoji_async(
                    session, name, path, self.app_id, self.bot_token
                )
                new_tag = (
                    f"<a:{name}:{new_id}>"
                    if path.endswith(".gif")
                    else f"<:{name}:{new_id}>"
                )
                self.emojis_db[name] = new_tag
                return new_tag, True
            except Exception as e:
                print(f"[Error] Failed to create emoji {name}: {e}")
                return None, False
        return tag, False

    def _set_configured_True(self):
        try:
            path = "database/emojis/emojis_data.json"
            data = {}
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            data["configured"] = "True"
            data["lastToken"] = self.bot_token
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"[Sync] Falha ao marcar configured=True: {e}")

    async def sync_all_async(self, progress_callback=None):
        total = len(self.emojis_db)
        success = 0
        added = 0

        connector = aiohttp.TCPConnector(limit=50)
        async with aiohttp.ClientSession(connector=connector) as session:
            guild_emojis = await self._list_guild_emojis_async(session)

            # Processar em lotes de 10 emojis por vez
            names = list(self.emojis_db.keys())
            batch_size = 10

            for i in range(0, len(names), batch_size):
                batch = names[i : i + batch_size]
                tasks = [
                    self.validate_or_create_async(session, name, guild_emojis)
                    for name in batch
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                for name, result in zip(batch, results):
                    if isinstance(result, Exception):
                        print(f"[Sync] Erro ao processar {name}: {result}")
                        continue

                    tag, was_added = result
                    if tag:
                        success += 1
                    if was_added:
                        added += 1

                    if progress_callback:
                        progress_callback(success, total)

                # Atualizar lista de emojis após cada lote
                if added > 0:
                    guild_emojis = await self._list_guild_emojis_async(session)

        # Salvar todas as mudanças de uma vez
        self.save()

        if success == total:
            self._set_configured_True()
            print("[Sync] Todos os emojis foram sincronizados.")

            if added > 0:
                print(f"[Sync] {added} novos emojis foram adicionados ao bot.")
                return os.execv(sys.executable, ["python"] + sys.argv)
            else:
                print("[Sync] Nenhum novo emoji foi adicionado.")

        return success, total

    def sync_all(self, progress_callback=None):
        """Versão síncrona para compatibilidade"""
        return asyncio.run(self.sync_all_async(progress_callback))