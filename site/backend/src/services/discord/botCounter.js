/**
 * Serviço de contador de aplicações no Discord
 * Atualiza o nome de um canal de voz com a quantidade total de aplicações
 */

import { Client, GatewayIntentBits } from "discord.js";
import Application from "../../database/models/Application.js";

let client = null;
let isRunning = false;

/**
 * Atualiza o nome do canal de voz com a contagem de aplicações
 */
async function updateBotCounter() {
  try {
    const channelId = process.env.DISCORD_COUNTER_CHANNEL_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!channelId) {
      console.warn("[BOT COUNTER] DISCORD_COUNTER_CHANNEL_ID não configurado");
      return;
    }

    if (!guildId) {
      console.warn("[BOT COUNTER] DISCORD_GUILD_ID não configurado");
      return;
    }

    // Conta total de aplicações no banco
    const totalApps = await Application.countDocuments();

    // Busca o canal
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      console.error("[BOT COUNTER] Servidor Discord não encontrado");
      return;
    }

    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      console.error("[BOT COUNTER] Canal não encontrado");
      return;
    }

    // Verifica se é um canal de voz
    if (channel.type !== 2) { // 2 = GUILD_VOICE
      console.error("[BOT COUNTER] O canal especificado não é um canal de voz");
      return;
    }

    // Atualiza o nome do canal
    const newName = `Aplicações: ${totalApps}`;
    
    // Só atualiza se o nome mudou (evita rate limit)
    if (channel.name !== newName) {
      await channel.setName(newName);
      console.log(`[BOT COUNTER] Canal atualizado: ${newName}`);
    }
  } catch (error) {
    console.error("[BOT COUNTER] Erro ao atualizar contador:", error.message);
  }
}

/**
 * Inicia o serviço de contador
 */
export async function startBotCounter() {
  if (isRunning) {
    console.warn("[BOT COUNTER] Serviço já está rodando");
    return;
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.error("[BOT COUNTER] DISCORD_BOT_TOKEN não configurado");
    return;
  }

  try {
    // Cria cliente Discord
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    // Aguarda o bot estar pronto
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout ao conectar no Discord"));
      }, 30000);

      client.once("ready", () => {
        clearTimeout(timeout);
        console.log(`[BOT COUNTER] Bot conectado como ${client.user.tag}`);
        resolve();
      });

      client.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      client.login(botToken);
    });

    isRunning = true;

    // Atualiza imediatamente
    await updateBotCounter();

    // Atualiza a cada 5 minutos
    setInterval(updateBotCounter, 5 * 60 * 1000);

    console.log("[BOT COUNTER] Serviço de contador iniciado");
  } catch (error) {
    console.error("[BOT COUNTER] Erro ao iniciar serviço:", error.message);
    if (client) {
      client.destroy();
      client = null;
    }
    isRunning = false;
  }
}

/**
 * Para o serviço de contador
 */
export async function stopBotCounter() {
  if (!isRunning) {
    return;
  }

  try {
    if (client) {
      await client.destroy();
      client = null;
    }
    isRunning = false;
    console.log("[BOT COUNTER] Serviço de contador parado");
  } catch (error) {
    console.error("[BOT COUNTER] Erro ao parar serviço:", error.message);
  }
}

/**
 * Força atualização imediata do contador
 */
export async function forceUpdateCounter() {
  if (!isRunning) {
    console.warn("[BOT COUNTER] Serviço não está rodando");
    return;
  }

  await updateBotCounter();
}
