import disnake
from functions.emoji import emoji
from functions.database import database as db


async def send_transcript_to_dm(interaction: disnake.ApplicationCommandInteraction, transcript_file: disnake.File):
    """
    Envia o transcript gerado para a DM do usuário.

    :param interaction: A interação do comando para responder.
    :param transcript_file: O arquivo de transcript para enviar.
    """
    config = db.get_document("tickets_config") or {}
    tickets_data = db.get_document("tickets_data") or {}
    
    panel_id = None
    if isinstance(interaction.channel, (disnake.TextChannel, disnake.Thread)):
        for pid, users in tickets_data.get("panels", {}).items():
            for user_id, tickets in users.items():
                for ticket in tickets:
                    if ticket.get("ticket_id") == interaction.channel.id:
                        panel_id = pid
                        break
                if panel_id: break
            if panel_id: break
            
    panel_data = config.get("panels", {}).get(panel_id, {}) if panel_id else {}
    messages = panel_data.get("messages", {})
    
    message_template = messages.get("transcript_dm_message", "Aqui está o transcript que você solicitou para o ticket `{channel_name}`:")
    message_content = message_template.format(
        channel_name=interaction.channel.name,
        guild_name=interaction.guild.name,
        user_mention=interaction.author.mention,
        user_name=interaction.author.name
    )

    try:
        await interaction.author.send(
            content=message_content,
            file=transcript_file
        )
        await interaction.followup.send(f"{emoji.double_check} Transcript enviado para sua DM!", ephemeral=True)
    except disnake.Forbidden:
        # File pointer needs to be reset to be sent again
        transcript_file.fp.seek(0)
        await interaction.followup.send(
            f"{emoji.wrong} Não consegui enviar o transcript para sua DM. Elas estão desabilitadas?\n"
            "Aqui está uma cópia para você baixar:",
            file=transcript_file,
            ephemeral=True
        )
    except disnake.HTTPException as e:
        print(f"Erro ao enviar o transcript para o usuário via DM: {e}")
        await interaction.followup.send(
            f"{emoji.wrong} Ocorreu um erro ao tentar enviar o transcript.",
            ephemeral=True
        )
