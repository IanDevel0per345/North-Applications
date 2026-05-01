import Gift from "../../database/models/Gift.js";
import Application from "../../database/models/Application.js";
import Payment from "../../database/models/Payment.js";
import Plan from "../../database/models/Plan.js";
import User from "../../database/models/User.js";
import mongoose from "mongoose";
const { Types } = mongoose;
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { deployBotWithConfig } from "../../services/botDeployment.js";
import { addRoleToMember } from "../../services/discord/cargoCliente.js";
import { addUserToGuild } from "../../services/discord/puxarDiscord.js";
import { getLatestPlanVersion } from "../../services/massUpdate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * POST /gifts/redeem
 * Resgata um gift code, cria aplicação, hospeda bot e atribui cargo Discord
 */
export default async function redeemGift(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { code, applicationId } = req.body;
    const userId = req.user?._id || req.user?._id;

    console.log(`[GIFT REDEEM] Resgatando gift - Code: ${code}, ApplicationId: ${applicationId || 'NOVO BOT'}, UserId: ${userId}`);

    // Valida se o usuário está autenticado
    if (!userId) {
      await session.abortTransaction();
      return res.status(401).json({
        success: false,
        message: "Usuário não autenticado",
      });
    }

    // Validação básica
    if (!code || typeof code !== "string") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Código do gift é obrigatório",
      });
    }

    // Normaliza o código (remove espaços e converte para maiúsculas)
    const normalizedCode = code.trim().toUpperCase();

    // Busca o gift
    const gift = await Gift.findOne({ code: normalizedCode }).session(session);

    if (!gift) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Gift não encontrado",
      });
    }

    // Verifica se o gift já foi usado
    if (gift.isUsed) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Este gift já foi resgatado",
      });
    }

    // Verifica se o gift expirou
    if (gift.expiresAt && new Date() > gift.expiresAt) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Este gift expirou",
      });
    }

    // Busca o plano
    const plan = await Plan.findOne({ id: gift.planId }).session(session);
    if (!plan) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Plano associado ao gift não encontrado",
      });
    }

    // Busca informações do usuário
    const user = await User.findById(userId).select("discordId oauth").session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado",
      });
    }

    // Se applicationId foi fornecido, adiciona dias ao bot existente
    if (applicationId) {
      console.log(`[GIFT REDEEM] Buscando aplicação - ID: ${applicationId}, UserId: ${userId}`);
      
      // Converte userId para ObjectId se necessário
      const userObjectId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId;
      
      const existingApp = await Application.findOne({
        _id: applicationId,
        userId: userObjectId,
        isDeleted: { $ne: true },
      }).session(session);

      console.log(`[GIFT REDEEM] Aplicação encontrada:`, existingApp ? 'SIM' : 'NÃO');

      if (!existingApp) {
        await session.abortTransaction();
        
        // Debug: busca sem filtro de userId para ver se existe
        const appExists = await Application.findById(applicationId);
        console.log(`[GIFT REDEEM] App existe no banco:`, appExists ? 'SIM' : 'NÃO');
        if (appExists) {
          console.log(`[GIFT REDEEM] App userId:`, appExists.userId, 'JWT userId:', userId);
        }
        
        return res.status(404).json({
          success: false,
          message: "Aplicação não encontrada ou não pertence a você",
        });
      }

      // Adiciona os meses à data de expiração
      const currentExpiry = new Date(existingApp.expiresAt);
      const now = new Date();
      
      // Se já expirou, começa a contar de hoje
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + gift.months);
      
      existingApp.expiresAt = baseDate;
      
      // Se estava bloqueado, desbloqueia
      if (existingApp.isBlocked) {
        existingApp.isBlocked = false;
        existingApp.blockedAt = null;
      }
      
      await existingApp.save({ session });

      // Cria pagamento para registro
      const paymentExpiresAt = new Date();
      paymentExpiresAt.setDate(paymentExpiresAt.getDate() + 30);

      const payment = new Payment({
        userId,
        priceFinal: 0,
        efiId: `GIFT-${gift.code}`,
        status: "approved",
        expiresAt: paymentExpiresAt,
        plan: {
          id: gift.planId,
          name: gift.planName,
          price: 0,
          months: gift.months,
        },
        qrCodeText: `Gift Code: ${gift.code} (Renovação)`,
      });
      await payment.save({ session });

      // Marca o gift como usado
      gift.isUsed = true;
      gift.usedBy = userId;
      gift.usedAt = new Date();
      gift.applicationId = existingApp._id;
      await gift.save({ session });

      // Commit da transação
      await session.commitTransaction();

      return res.status(200).json({
        success: true,
        message: "Gift aplicado com sucesso!",
        data: {
          planName: gift.planName,
          months: gift.months,
          expiresAt: existingApp.expiresAt,
        },
      });
    }

    // Calcula data de expiração do pagamento (30 dias para gifts)
    const paymentExpiresAt = new Date();
    paymentExpiresAt.setDate(paymentExpiresAt.getDate() + 30);

    // Cria um pagamento fictício para o gift
    const payment = new Payment({
      userId,
      priceFinal: 0,
      efiId: `GIFT-${gift.code}`,
      status: "approved",
      expiresAt: paymentExpiresAt,
      plan: {
        id: gift.planId,
        name: gift.planName,
        price: 0,
        months: gift.months,
      },
      qrCodeBase64: null,
      qrCodeText: `Gift Code: ${gift.code}`,
    });
    await payment.save({ session });

    // Calcula data de expiração
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + gift.months);

    // Prepara ZIP do plano para hospedagem
    let zipPath = null;
    if (plan.zipFilename) {
      // Tenta diferentes caminhos possíveis
      const possiblePaths = [
        path.resolve(process.cwd(), "src/database/zip", plan.zipFilename),
        path.resolve(process.cwd(), "backend/src/database/zip", plan.zipFilename),
        path.join(__dirname, "../../database/zip", plan.zipFilename)
      ];
      
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          zipPath = testPath;
          console.log(`[GIFT REDEEM] ZIP encontrado em: ${zipPath}`);
          break;
        }
      }
      
      if (!zipPath) {
        console.error(`[GIFT REDEEM] ZIP não encontrado em nenhum dos caminhos possíveis para: ${plan.zipFilename}`);
      }
    }

    // Gera ID único para o bot
    const botID = String(payment._id);
    const ownerDiscordId = user.discordId;

    // Busca a última versão do plano
    const planVersion = await getLatestPlanVersion(plan.id);
    console.log(`[GIFT REDEEM] Versão do plano ${plan.id}: ${planVersion || 'Nenhuma'}`);

    // Deploy do bot com config personalizado
    let hostingResponse = null;
    let hostingApp = null;
    let hostingAppId = null;

    if (zipPath) {
      try {
        const deployResult = await deployBotWithConfig(zipPath, botID, ownerDiscordId, planVersion);
        
        // Debug para ver o que está no deployResult
        console.log(`[GIFT REDEEM] deployResult recebido:`, JSON.stringify({
          success: deployResult.success,
          appId: deployResult.appId,
          botID: deployResult.botID,
          botToken: deployResult.botToken
        }, null, 2));
        
        // Captura os valores imediatamente
        hostingResponse = deployResult.discloudResponse;
        hostingAppId = deployResult.appId;
        
        console.log(`[GIFT REDEEM] hostingAppId capturado: ${hostingAppId}`);
        
        hostingApp = hostingResponse?.app || hostingResponse?.apps || null;
        
        // Fallback caso deployResult.appId não exista
        if (!hostingAppId) {
          console.log(`[GIFT REDEEM] AppId não encontrado em deployResult, tentando fallback...`);
          hostingAppId = hostingResponse?.app?.id || 
                        hostingApp?.id || 
                        hostingResponse?.appId || 
                        hostingResponse?.id || 
                        null;
          console.log(`[GIFT REDEEM] AppId após fallback: ${hostingAppId}`);
        }

        console.log(`[GIFT REDEEM] Bot hospedado com sucesso! AppID final: ${hostingAppId}, BotToken: ${deployResult.botToken}`);
        
        if (!hostingAppId) {
          console.error(`[GIFT REDEEM] AVISO: AppId não foi capturado da resposta da Discloud!`);
        }
      } catch (err) {
        console.error("[GIFT REDEEM] Erro ao fazer deploy do bot:", err);
        // Continua mesmo se falhar o deploy
      }
    }

    // Debug final antes de salvar
    const finalAppId = hostingAppId ? String(hostingAppId) : "";
    console.log(`[GIFT REDEEM] Salvando aplicação com hostingAppId: '${finalAppId}' (tipo: ${typeof finalAppId})`);
    console.log(`[GIFT REDEEM] hostingResponse disponível: ${!!hostingResponse}`);
    console.log(`[GIFT REDEEM] hostingApp disponível: ${!!hostingApp}`);
    
    // Cria a aplicação
    const application = new Application({
      userId,
      paymentId: payment._id,
      name: `${plan.name} (Gift)`,
      botID,
      plan: {
        id: plan.id,
        name: plan.name,
        months: gift.months,
        price: 0,
        paymentId: payment._id,
      },
      hosting: {
        provider: "discloud",
        appId: String(finalAppId || ""), // Força conversão para string
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
        owner: String(ownerDiscordId || null),
        id: null,
        perms: [],
        server: null,
      },
      info: {
        name: plan.name,
        imageUrl: null,
        id: null,
      },
      expiresAt,
      updateVersion: planVersion, // Define a versão do plano
    });
    
    // Teste explícito do appId
    if (!application.hosting.appId && finalAppId) {
      console.log(`[GIFT REDEEM] ERRO: appId não foi definido no objeto application! Tentando definir manualmente...`);
      application.hosting.appId = String(finalAppId);
    }
    
    console.log(`[GIFT REDEEM] Application antes de salvar - hosting.appId: '${application.hosting?.appId}'`);
    console.log(`[GIFT REDEEM] Application.hosting completo:`, JSON.stringify(application.hosting, null, 2));
    
    await application.save({ session });
    
    console.log(`[GIFT REDEEM] Application após salvar - _id: ${application._id}, hosting.appId: '${application.hosting?.appId}'`);

    // Marca o gift como usado
    gift.isUsed = true;
    gift.usedBy = userId;
    gift.usedAt = new Date();
    gift.applicationId = application._id;
    await gift.save({ session });

    // Commit da transação
    await session.commitTransaction();

    // Atribui cargo Discord (fora da transação para não bloquear)
    try {
      const roleId = plan.discordRoleId || process.env.DISCORD_DEFAULT_ROLE_ID;
      if (roleId && user.discordId) {
        // Tenta adicionar usuário ao servidor se tiver OAuth
        if (user.oauth?.accessToken) {
          try {
            await addUserToGuild({
              userId: user.discordId,
              accessToken: user.oauth.accessToken,
              guildId: process.env.DISCORD_GUILD_ID,
            });
          } catch (e) {
            console.warn("[GIFT REDEEM] Falha ao adicionar usuário ao servidor:", e?.message);
          }
        }

        // Atribui o cargo
        await addRoleToMember({
          userId: user.discordId,
          roleId,
          guildId: process.env.DISCORD_GUILD_ID,
        });
        console.log(`[GIFT REDEEM] Cargo ${roleId} atribuído ao usuário ${user.discordId}`);
      }
    } catch (e) {
      console.warn("[GIFT REDEEM] Falha ao atribuir cargo Discord:", e?.message || e);
    }

    return res.status(200).json({
      success: true,
      message: "Gift resgatado com sucesso!",
      data: {
        application: {
          id: application._id,
          name: application.name,
          planName: plan.name,
          months: gift.months,
          expiresAt: application.expiresAt,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[GIFT REDEEM ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao resgatar gift",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
}
