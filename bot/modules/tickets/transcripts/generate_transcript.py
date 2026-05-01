import disnake
import chat_exporter as dht
import io
from disnake.ext import commands


async def generate_transcript(channel: disnake.TextChannel, bot: commands.Bot, limit: int = None) -> disnake.File | None:
    """
    Gera um arquivo de transcript em HTML para um canal específico.

    :param channel: O canal do qual gerar o transcript.
    :param bot: A instância do bot para buscar membros fora da guilda.
    :param limit: O número máximo de mensagens a serem incluídas.
    :return: Um objeto disnake.File contendo o transcript, ou None se falhar.
    """
    try:
        transcript_html = await dht.export(
            channel,
            limit=limit,
            bot=bot,
        )

        if not transcript_html:
            return None

        return disnake.File(
            io.BytesIO(transcript_html.encode()),
            filename=f"transcript-{channel.name}.html",
        )
    except Exception as e:
        print(f"Falha ao gerar transcript: {e}")
        return None
