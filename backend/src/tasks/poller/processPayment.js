import { isPaymentExpired, markPaymentExpired, updatePaymentStatus } from "./payment/payments.js";
import { fetchPixStatus as fetchEfiStatus } from "./payment/efi.js";
import { fetchPixStatus as fetchWooviStatus } from "./payment/mistic.js";
import { redeemCouponUsage } from "./payment/coupons.js";
import { sendReceiptForPayment } from "./payment/receipts.js";
import { hospedarApp } from "./payment/hospedar.js";
import { addRoleToMember } from "../../services/discord/cargoCliente.js";
import { addUserToGuild } from "../../services/discord/puxarDiscord.js";
import { deployBotWithConfig } from "../../services/botDeployment.js";
import Plan from "../../database/models/Plan.js";
import User from "../../database/models/User.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Application from "../../database/models/Application.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function processPayment(payment) {
  if (isPaymentExpired(payment)) {
    await markPaymentExpired(payment);
    return;
  }

  // Determina qual provedor usar e qual ID buscar
  const provider = payment.provider || "woovi";
  const paymentId = provider === "woovi" ? payment.wooviId : payment.efiId;

  if (!paymentId) {
    console.error(`[poller] Pagamento ${payment._id} sem ID do provedor (provider: ${provider})`);
    return;
  }

  // Busca status usando o provedor correto
  let status;
  try {
    if (provider === "woovi") {
      status = await fetchWooviStatus(paymentId, provider);
    } else {
      status = await fetchEfiStatus(paymentId);
    }
  } catch (error) {
    console.error(`[poller] Erro ao verificar pagamento ${paymentId}:`, error?.message || error);
    return;
  }

  const changed = await updatePaymentStatus(payment, status);

  // Se o status é "approved", processa mesmo que não tenha mudado agora
  // (pode ter sido atualizado pelo webhook ou pela rota /status antes do poller rodar)
  if (status === "approved") {
    // Verifica se já existe uma Application vinculada a este pagamento
    const existingApp = await Application.findOne({ paymentId: payment._id }).lean();

    // Se não existe Application, processa o pagamento (idempotente)
    if (!existingApp) {
      console.log(`[poller] Pagamento ${payment._id} aprovado mas sem Application. Processando...`);
      await handleApprovedPayment(payment);
    } else if (changed) {
      // Se mudou agora e já existe Application, também processa (pode ser atualização)
      console.log(`[poller] Pagamento ${payment._id} mudou para approved. Processando...`);
      await handleApprovedPayment(payment);
    }
  }
}


export async function handleApprovedPayment(payment) {
  // Verifica se é uma renovação
  const isRenewal = payment.metadata?.isRenewal;

  if (isRenewal) {
    await handleRenewalPayment(payment);
    return;
  }

  const planId = payment?.plan?.id;
  if (!planId) return;

  const planObject = await Plan.findOne({ id: planId }).lean();
  if (!planObject) return;

  await redeemCouponUsage(payment);
  await sendReceiptForPayment(payment);

  // Prepara ZIP do plano
  let zipPath = null;
  if (planObject.zipFilename) {
    // Tenta diferentes caminhos possíveis
    const possiblePaths = [
      path.resolve(process.cwd(), "src/database/zip", planObject.zipFilename),
      path.resolve(process.cwd(), "backend/src/database/zip", planObject.zipFilename),
      path.join(__dirname, "../../database/zip", planObject.zipFilename)
    ];

    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        zipPath = testPath;
        console.log(`[handleApprovedPayment] ZIP encontrado em: ${zipPath}`);
        break;
      }
    }

    if (!zipPath) {
      console.error(`[handleApprovedPayment] ZIP não encontrado em nenhum dos caminhos possíveis para: ${planObject.zipFilename}`);
      return;
    }
  } else {
    console.error("[handleApprovedPayment] Plano sem zipFilename definido");
    return;
  }

  // Busca owner Discord ID
  const owner = await User.findById(payment.userId).select("discordId").lean();
  const ownerDiscordId = owner?.discordId;

  // Gera ID único para o bot (usaremos o paymentId como botID)
  const botID = String(payment._id);

  // Deploy com config.json personalizado
  let hostingResponse;
  let hostingApp;
  let hostingAppId;

  try {
    const deployResult = await deployBotWithConfig(zipPath, botID, ownerDiscordId, planObject?.version);
    hostingResponse = deployResult.discloudResponse;

    // O appId vem diretamente do deployResult
    hostingAppId = deployResult.appId;

    hostingApp = hostingResponse?.app || null;

    // Fallback caso deployResult.appId não exista
    if (!hostingAppId) {
      hostingAppId = hostingResponse?.app?.id ||
        hostingApp?.id ||
        hostingResponse?.appId ||
        hostingResponse?.id ||
        null;
    }

    console.log(`[handleApprovedPayment] Bot hospedado com sucesso! AppID: ${hostingAppId}, BotToken: ${deployResult.botToken}`);

    if (!hostingAppId) {
      console.error(`[handleApprovedPayment] AVISO: AppId não foi capturado da resposta da Discloud!`);
    }
  } catch (err) {
    console.error("[handleApprovedPayment] Erro ao fazer deploy do bot:", err);
    // Fallback para método antigo se falhar
    hostingResponse = await hospedarApp(zipPath);
    hostingApp = hostingResponse?.app || null;
    hostingAppId = hostingApp?.appId || hostingResponse?.appId || hostingResponse?.id || null;
  }

  const months = Number(payment?.plan?.months) || planObject?.plans?.find((p) => String(p.id) === String(payment?.plan?.monthId))?.months || 1;
  const daysToAdd = Number(months) * 30;
  const expiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);

  // Debug final antes de salvar
  console.log(`[handleApprovedPayment] Salvando aplicação com hostingAppId: ${hostingAppId}`);

  // Monta payload base para criação/atualização
  const applicationPayload = {
    name: planObject.name,
    userId: payment.userId,
    paymentId: payment._id,
    botID, // Vincula com BotConfig
    plan: {
      id: planObject.id,
      name: planObject.name,
      months,
      price: payment?.priceFinal,
      paymentId: payment._id,
    },
    hosting: {
      provider: "discloud",
      appId: hostingAppId ? String(hostingAppId) : "",
      name: hostingApp?.name || hostingResponse?.app?.name || null,
      ram: hostingApp?.ram || hostingResponse?.app?.ram || null,
      version: hostingApp?.version || hostingResponse?.app?.version || null,
      main: hostingApp?.mainFile || hostingResponse?.app?.mainFile || hostingApp?.main || null,
      status: hostingResponse?.message || hostingResponse?.status || null,
      url: hostingApp?.avatarURL || hostingResponse?.app?.avatarURL || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    bot: {
      token: null,
      owner: String(ownerDiscordId || ""),
      id: null,
      perms: ownerDiscordId ? [String(ownerDiscordId)] : [],
      server: null,
    },
    info: {
      name: "Vision Pro",
      imageUrl: null,
      id: null,
    },
    expiresAt,
  };

  // Usa upsert idempotente baseado no paymentId para evitar duplicação e garantir persistência
  try {
    await Application.findOneAndUpdate(
      { paymentId: payment._id },
      { $set: applicationPayload, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error("[handleApprovedPayment] Erro ao salvar/atualizar Application:", err?.message || err);
  }

  try {
    const roleId = planObject.discordRoleId || process.env.DISCORD_DEFAULT_ROLE_ID;
    if (roleId) {
      const buyer = await User.findById(payment.userId).select("discordId oauth").lean();
      if (buyer?.discordId) {
        if (buyer?.oauth?.accessToken) {
          try {
            await addUserToGuild({ userId: buyer.discordId, accessToken: buyer.oauth.accessToken, guildId: process.env.DISCORD_GUILD_ID });
          } catch { }
        }
        await addRoleToMember({ userId: buyer.discordId, roleId, guildId: process.env.DISCORD_GUILD_ID });
      }
    }
  } catch (e) {
    console.warn("[payments] falha ao atribuir cargo:", e?.message || e);
  }
}

/**
 * Processa pagamento de renovação
 */
export async function handleRenewalPayment(payment) {
  try {
    const applicationId = payment.metadata?.applicationId;
    if (!applicationId) {
      console.error("[RENEWAL] applicationId não encontrado no metadata");
      return;
    }

    // Busca a aplicação
    const application = await Application.findById(applicationId);
    if (!application) {
      console.error("[RENEWAL] Aplicação não encontrada:", applicationId);
      return;
    }

    // Calcula nova data de expiração
    const currentExpiration = new Date(application.expiresAt);
    const now = new Date();

    // Pega os meses do metadata ou do plan
    const months = payment.metadata?.months || payment.plan?.months || 1;
    const daysToAdd = Number(months) * 30; // renovar em dias para padronizar (30 dias por mês)

    // Se já expirou, renova a partir de agora. Senão, adiciona ao tempo restante
    const baseDate = currentExpiration > now ? currentExpiration : now;
    const newExpiration = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    // Atualiza a aplicação
    application.expiresAt = newExpiration;
    application.lastChargeSent = null; // Reseta para enviar novas cobranças

    // Se estava bloqueado, tenta recuperar automaticamente
    if (application.isBlocked && !application.isDeleted) {
      const appId = application.hosting?.appId;
      const token = process.env.DISCLOUD_API_TOKEN;

      if (appId && token) {
        try {
          // Tenta iniciar o app na Discloud
          const response = await fetch(`https://api.discloud.app/v2/app/${appId}/start`, {
            method: "PUT",
            headers: {
              "api-token": token,
            },
          });

          if (response.ok) {
            application.isBlocked = false;
            application.blockedAt = null;
            console.log(`[RENEWAL] Aplicação ${applicationId} desbloqueada e reiniciada`);
          } else {
            console.warn(`[RENEWAL] Não foi possível reiniciar app ${appId}`);
          }
        } catch (error) {
          console.error(`[RENEWAL] Erro ao reiniciar app:`, error.message);
        }
      }
    }

    await application.save();

    // Redime uso do cupom se houver
    await redeemCouponUsage(payment);

    // Envia recibo
    await sendReceiptForPayment(payment);

    console.log(`[RENEWAL] Aplicação ${applicationId} renovada até ${newExpiration.toISOString()}`);
  } catch (error) {
    console.error("[RENEWAL] Erro ao processar renovação:", error);
  }
}
