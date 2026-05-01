/**
 * Serviço de bloqueio e deleção automática de aplicações vencidas
 */

import Application from "../../database/models/Application.js";
import User from "../../database/models/User.js";
import { discloud } from "discloud.app";
import { connectToUserBot } from "../../database/bots.js";

/**
 * Para uma aplicação na Discloud
 */
async function stopDiscloudApp(appId) {
  try {
    if (!appId) return false;

    const token = process.env.DISCLOUD_API_TOKEN;
    if (!token) {
      console.error("[BLOCK SERVICE] DISCLOUD_API_TOKEN não configurado");
      return false;
    }

    const response = await fetch(`https://api.discloud.app/v2/app/${appId}/stop`, {
      method: "PUT",
      headers: {
        "api-token": token,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[BLOCK SERVICE] Erro ao parar app ${appId}:`, error);
      return false;
    }

    console.log(`[BLOCK SERVICE] App ${appId} parado com sucesso`);
    return true;
  } catch (error) {
    console.error(`[BLOCK SERVICE] Erro ao parar app ${appId}:`, error.message);
    return false;
  }
}

/**
 * Deleta uma aplicação na Discloud
 */
async function deleteDiscloudApp(appId) {
  try {
    if (!appId) return false;

    const token = process.env.DISCLOUD_API_TOKEN;
    if (!token) {
      console.error("[BLOCK SERVICE] DISCLOUD_API_TOKEN não configurado");
      return false;
    }

    const response = await fetch(`https://api.discloud.app/v2/app/${appId}/delete`, {
      method: "DELETE",
      headers: {
        "api-token": token,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[BLOCK SERVICE] Erro ao deletar app ${appId}:`, error);
      return false;
    }

    console.log(`[BLOCK SERVICE] App ${appId} deletado com sucesso`);
    return true;
  } catch (error) {
    console.error(`[BLOCK SERVICE] Erro ao deletar app ${appId}:`, error.message);
    return false;
  }
}

/**
 * Envia DM ao usuário informando sobre o bloqueio
 */
async function sendBlockDM(application, user) {
  try {
    const botToken = application.bot?.token;
    if (!botToken) {
      console.log(`[BLOCK SERVICE] Bot sem token configurado para ${application._id}`);
      return false;
    }

    const discordUserId = user.discordId;
    if (!discordUserId) {
      console.log(`[BLOCK SERVICE] Usuário sem Discord ID: ${user._id}`);
      return false;
    }

    const bot = await connectToUserBot(botToken);
    if (!bot) {
      console.error(`[BLOCK SERVICE] Erro ao conectar bot para ${application._id}`);
      return false;
    }

    const dmChannel = await bot.users.createDM(discordUserId);

    const blockedAt = Math.floor(new Date(application.blockedAt).getTime() / 1000);
    const deleteAt = Math.floor((new Date(application.blockedAt).getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);
    const renewLink = `${process.env.FRONTEND_URL}/dashboard/invoices?renew=${application._id}`;

    await dmChannel.send({
      components: [
        {
          type: 17,
          accent_color: null,
          spoiler: false,
          components: [
            {
              type: 10,
              content: `Olá senhor(a) <@${discordUserId}>!`,
            },
          ],
        },
        {
          type: 17,
          accent_color: 15158332,
          spoiler: false,
          components: [
            {
              type: 10,
              content: "# APLICAÇÃO BLOQUEADA",
            },
            {
              type: 14,
              divider: true,
              spacing: 1,
            },
            {
              type: 10,
              content: `Sua aplicação **${application.name}** foi bloqueada por falta de pagamento.\n\nPlano: **${application.plan.name}**\nID da Aplicação: \`${application._id}\`\nBloqueado em: <t:${blockedAt}:D>`,
            },
            {
              type: 14,
              divider: false,
              spacing: 1,
            },
            {
              type: 10,
              content: `**Prazo para renovação:**\n• Você tem 7 dias para renovar sua assinatura\n• Após este prazo, a aplicação será deletada permanentemente\n• Data limite: <t:${deleteAt}:D> (<t:${deleteAt}:R>)`,
            },
            {
              type: 14,
              divider: true,
              spacing: 1,
            },
            {
              type: 10,
              content: "Renove sua assinatura agora para reativar sua aplicação e continuar desfrutando de nossos serviços.\n-# Clique no botão abaixo para renovar. Se já renovou, ignore esta mensagem.",
            },
            {
              type: 14,
              divider: true,
              spacing: 1,
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "Renovar Agora",
                  emoji: null,
                  disabled: false,
                  url: renewLink,
                },
              ],
            },
          ],
        },
      ],
      flags: 32768,
    });

    console.log(`[BLOCK SERVICE] DM de bloqueio enviada para usuário ${user._id}`);
    return true;
  } catch (error) {
    console.error(`[BLOCK SERVICE] Erro ao enviar DM de bloqueio:`, error.message);
    return false;
  }
}

/**
 * Bloqueia aplicações vencidas
 * - Para o bot na Discloud
 * - Marca como bloqueado no banco
 */
export async function blockExpiredApps() {
  try {
    const now = new Date();

    // Busca aplicações vencidas que não estão bloqueadas (ignora apps free)
    const expiredApps = await Application.find({
      expiresAt: { $lt: now },
      isBlocked: false,
      isDeleted: false,
      isFree: { $ne: true }, // Planos free não expiram
    });

    console.log(`[BLOCK SERVICE] Encontradas ${expiredApps.length} aplicações vencidas para bloquear`);

    for (const app of expiredApps) {
      try {
        // Para o bot na Discloud
        const appId = app.hosting?.appId;
        if (appId) {
          await stopDiscloudApp(appId);
        }

        // Marca como bloqueado
        app.isBlocked = true;
        app.blockedAt = now;
        await app.save();

        console.log(`[BLOCK SERVICE] Aplicação ${app._id} bloqueada com sucesso`);

        // Envia DM para todos os usuários com permissões
        try {
          // Coleta todos os IDs de usuários
          const userDiscordIds = new Set();

          // Adiciona o owner
          const user = await User.findById(app.userId);
          if (user?.discordId) {
            userDiscordIds.add(user.discordId);
          }

          // Adiciona o owner do bot se for diferente
          if (app.bot?.owner && app.bot.owner !== user?.discordId) {
            userDiscordIds.add(app.bot.owner);
          }

          // Adiciona todos os usuários com permissões
          if (app.bot?.perms && Array.isArray(app.bot.perms)) {
            app.bot.perms.forEach(permId => {
              if (permId) {
                userDiscordIds.add(permId);
              }
            });
          }

          if (userDiscordIds.size === 0) {
            console.log(`[BLOCK SERVICE] Nenhum usuário encontrado para enviar DM da aplicação ${app._id}`);
          } else {
            console.log(`[BLOCK SERVICE] Enviando DM de bloqueio para ${userDiscordIds.size} usuário(s)`);

            for (const discordId of userDiscordIds) {
              try {
                // Cria um objeto user temporário com o discordId
                const tempUser = { discordId, _id: app.userId };
                await sendBlockDM(app, tempUser);
                console.log(`[BLOCK SERVICE] DM de bloqueio enviada para ${discordId}`);

                // Aguarda 1 segundo entre cada envio
                await new Promise((resolve) => setTimeout(resolve, 1000));
              } catch (dmError) {
                console.error(`[BLOCK SERVICE] Erro ao enviar DM para ${discordId}:`, dmError.message);
              }
            }
          }
        } catch (dmError) {
          console.error(`[BLOCK SERVICE] Erro ao processar DMs para ${app._id}:`, dmError.message);
        }
      } catch (error) {
        console.error(`[BLOCK SERVICE] Erro ao bloquear aplicação ${app._id}:`, error.message);
      }
    }

    console.log(`[BLOCK SERVICE] Bloqueio de aplicações concluído`);
  } catch (error) {
    console.error("[BLOCK SERVICE] Erro no bloqueio de aplicações:", error);
  }
}

/**
 * Deleta aplicações bloqueadas há mais de 7 dias
 * - Deleta da Discloud
 * - Marca como deleted no banco (não remove do banco)
 */
export async function deleteOldBlockedApps() {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Busca aplicações bloqueadas há mais de 7 dias
    const oldBlockedApps = await Application.find({
      isBlocked: true,
      blockedAt: { $lt: sevenDaysAgo },
      isDeleted: false,
    });

    console.log(`[BLOCK SERVICE] Encontradas ${oldBlockedApps.length} aplicações para deletar`);

    for (const app of oldBlockedApps) {
      try {
        // Deleta da Discloud
        const appId = app.hosting?.appId;
        if (appId) {
          await deleteDiscloudApp(appId);
        }

        // Marca como deletado (não remove do banco)
        app.isDeleted = true;
        app.deletedAt = now;
        await app.save();

        console.log(`[BLOCK SERVICE] Aplicação ${app._id} deletada com sucesso`);
      } catch (error) {
        console.error(`[BLOCK SERVICE] Erro ao deletar aplicação ${app._id}:`, error.message);
      }
    }

    console.log(`[BLOCK SERVICE] Deleção de aplicações concluída`);
  } catch (error) {
    console.error("[BLOCK SERVICE] Erro na deleção de aplicações:", error);
  }
}

/**
 * Verifica e processa bloqueios e deleções
 */
export async function checkAndProcessBlocks() {
  console.log("[BLOCK SERVICE] Iniciando verificação de bloqueios e deleções");

  // Bloqueia aplicações vencidas
  await blockExpiredApps();

  // Deleta aplicações bloqueadas há mais de 7 dias
  await deleteOldBlockedApps();

  console.log("[BLOCK SERVICE] Verificação concluída");
}

/**
 * Inicia o serviço de bloqueio (executado a cada 10 minutos)
 */
export function startBlockService() {
  console.log("[BLOCK SERVICE] Serviço de bloqueio iniciado");

  // Executa imediatamente
  checkAndProcessBlocks();

  // Executa a cada 10 minutos
  setInterval(checkAndProcessBlocks, 10 * 60 * 1000);
}
