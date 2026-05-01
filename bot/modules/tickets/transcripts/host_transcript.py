import disnake
from disnake.ext import commands


async def log_transcript(bot: commands.Bot, transcript_file: disnake.File, log_channel_id: int = None, message_to_reply: disnake.Message = None):
    """
    Envia o arquivo de transcript para um canal de log.
    Pode responder a uma mensagem existente se message_to_reply for fornecido.

    :param bot: A instância do bot.
    :param transcript_file: O arquivo de transcript a ser enviado.
    :param log_channel_id: O ID do canal de log (usado se message_to_reply não for fornecido).
    :param message_to_reply: A mensagem à qual responder com o transcript.
    """
    if message_to_reply:
        log_channel = message_to_reply.channel
    elif log_channel_id:
        log_channel = bot.get_channel(log_channel_id)
    else:
        print("Erro: Nenhum canal de log ou mensagem para responder foi fornecido.")
        return

    if not log_channel:
        print(f"Erro: Canal de log de transcripts com ID {log_channel_id} não encontrado.")
        return

    try:
        # Extrai o nome do canal do nome do arquivo para o título da mensagem
        channel_name = transcript_file.filename.split('-', 1)[1].replace('.html', '')
        
        
        if message_to_reply:
            await message_to_reply.reply(file=transcript_file)
        else:
            await log_channel.send(file=transcript_file)
            
    except disnake.HTTPException as e:
        print(f"Erro ao enviar o transcript para o canal de log: {e}")
    except IndexError:
        content = "Transcript de um canal:"
        if message_to_reply:
            await message_to_reply.reply(content, file=transcript_file)
        else:
            await log_channel.send(content, file=transcript_file)
