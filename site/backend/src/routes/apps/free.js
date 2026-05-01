import express from "express";
import Application from "../../database/models/Application.js";
import Plan from "../../database/models/Plan.js";
import User from "../../database/models/User.js";
import { deployBotWithConfig } from "../../services/botDeployment.js";
import { addRoleToMember } from "../../services/discord/cargoCliente.js";
import { addUserToGuild } from "../../services/discord/puxarDiscord.js";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * POST /apps/free
 * Cria uma aplicação gratuita
 * - Limite: 1 por conta Discord
 * - Não cria pagamento
 * - Não expira (sem expiresAt)
 * - Faz deploy automático se houver ZIP configurado no plano
 */
router.post("/free", async (req, res) => {
    try {
        const userId = req.user._id;

        // Busca usuário atualizado do banco para garantir que temos o discordId
        const user = await User.findById(userId).select("discordId oauth");
        const userDiscordId = user?.discordId;

        if (!userDiscordId) {
            return res.status(400).json({
                success: false,
                error: "Conta Discord não vinculada",
                message: "Você precisa ter uma conta Discord vinculada para criar um plano gratuito.",
            });
        }

        // Tenta marcar o usuário como tendo resgatado o plano free (Atomic Lock)
        // Se já for true, findOneAndUpdate retorna null (pois não achou match no filtro)
        const userUpdate = await User.findOneAndUpdate(
            { _id: userId, freePlanRedeemed: { $ne: true } },
            { $set: { freePlanRedeemed: true } }
        );

        if (!userUpdate) {
            return res.status(400).json({
                success: false,
                error: "Limite atingido",
                message: "Você já resgatou seu plano gratuito. Apenas 1 resgate é permitido por conta.",
            });
        }

        // Verifica se usuário já tem um app free (dupla verificação por segurança/legado)
        const existingFreeApp = await Application.countDocuments({
            userId,
            isFree: true,
            isDeleted: false,
        });

        if (existingFreeApp > 0) {
            // Se já tem app mas o flag estava false (inconsistência), mantemos o flag true agora e barramos
            return res.status(400).json({
                success: false,
                error: "Limite atingido",
                message: "Você já possui uma aplicação gratuita ativa.",
            });
        }

        // Busca o plano free no banco ou usa config padrão
        let freePlan = await Plan.findOne({ isFree: true }).lean();
        console.log("[FREE APP] Plano encontrado:", freePlan ? `${freePlan.name} (zip: ${freePlan.zipFilename})` : "Nenhum (usando default)");

        if (!freePlan) {
            // Plano free padrão se não existir no banco
            freePlan = {
                id: "vision-free",
                name: "Vision Free",
                isFree: true,
            };
        }

        // Prepara ZIP do plano se existir
        let zipPath = null;
        if (freePlan.zipFilename) {
            const possiblePaths = [
                path.resolve(process.cwd(), "src/database/zip", freePlan.zipFilename),
                path.resolve(process.cwd(), "backend/src/database/zip", freePlan.zipFilename),
                path.join(__dirname, "../../database/zip", freePlan.zipFilename)
            ];

            console.log("[FREE APP] Procurando ZIP em:", possiblePaths);

            for (const testPath of possiblePaths) {
                if (fs.existsSync(testPath)) {
                    zipPath = testPath;
                    console.log(`[FREE APP] ZIP encontrado em: ${zipPath}`);
                    break;
                }
            }
            if (!zipPath) console.log("[FREE APP] ZIP não encontrado em nenhum caminho.");
        } else {
            console.log("[FREE APP] Plano não tem zipFilename definido.");
        }

        // Gera ID único para o bot
        const botID = new mongoose.Types.ObjectId().toString();

        // 1. CRIA O DOCUMENTO NO BANCO PRIMEIRO (Lock atomic via Unique Index)
        const now = new Date();
        const applicationPayload = {
            userId,
            paymentId: null, // Apps free não têm pagamento
            name: "Vision Free",
            botID: botID,
            plan: {
                id: freePlan.id,
                name: freePlan.name,
                months: null, // Sem duração
                price: 0,
                paymentId: null,
            },
            hosting: {
                provider: "discloud",
                status: "deploying", // Status inicial temporário
                createdAt: now,
                updatedAt: now,
            },
            bot: {
                token: null,
                owner: userDiscordId,
                id: null,
                perms: [String(userDiscordId)],
                server: null,
            },
            info: {
                name: "Vision Free",
                imageUrl: null,
                id: null,
            },
            expiresAt: null, // Não expira
            isFree: true,
            lastStartedAt: now,
            inactivityWarningSentAt: null,
        };

        // Salva inicialmente. Se existir duplicata, estoura erro 11000 AQUI, antes do deploy.
        const newApp = await Application.create(applicationPayload);

        // 2. FAZ O DEPLOY (Se chegou aqui, é o único processo)
        if (zipPath) {
            try {
                console.log(`[FREE APP] Iniciando deploy para botID: ${botID}`);
                const deployResult = await deployBotWithConfig(zipPath, botID, userDiscordId, freePlan.version);
                const response = deployResult.discloudResponse;

                // Tenta extrair dados do app da resposta
                const appData = response?.app || {};
                const appId = deployResult.appId || appData.id || response?.appId;

                newApp.hosting = {
                    provider: "discloud",
                    appId: appId ? String(appId) : "",
                    name: appData.name || null,
                    ram: appData.ram || null,
                    version: appData.version || null,
                    main: appData.mainFile || appData.main || null,
                    status: response?.message || response?.status || "online",
                    url: appData.avatarURL || null,
                    createdAt: now,
                    updatedAt: new Date(),
                    lastDeployAt: new Date()
                };
                console.log(`[FREE APP] Deploy realizado com sucesso. AppID: ${appId}`);
                await newApp.save();

            } catch (deployError) {
                console.error(`[FREE APP] Erro no deploy:`, deployError);
                // Atualiza status para erro
                newApp.hosting.status = "error";
                await newApp.save();
            }
        } else {
            // Sem ZIP, apenas "configurado" mas sem deploy real
            newApp.hosting.status = "created";
            await newApp.save();
        }

        res.status(201).json({
            success: true,
            message: "Aplicação gratuita criada com sucesso!",
            data: {
                applicationId: newApp._id,
                name: newApp.name,
                plan: newApp.plan,
                hosting: newApp.hosting
            },
        });

        // Tenta atribuir cargo do discord
        try {
            const roleId = freePlan.discordRoleId || process.env.DISCORD_DEFAULT_ROLE_ID;
            if (roleId && userDiscordId) {
                if (user.oauth && user.oauth.accessToken) {
                    try {
                        await addUserToGuild({
                            userId: userDiscordId,
                            accessToken: user.oauth.accessToken,
                            guildId: process.env.DISCORD_GUILD_ID
                        });
                    } catch (e) {
                        console.warn("[FREE APP] Erro ao adicionar user na guilda:", e.message);
                    }
                }

                await addRoleToMember({
                    userId: userDiscordId,
                    roleId,
                    guildId: process.env.DISCORD_GUILD_ID
                });
                console.log(`[FREE APP] Cargo atribuído ao usuário ${userDiscordId}`);
            }
        } catch (roleError) {
            console.warn("[FREE APP] Falha ao atribuir cargo:", roleError.message);
        }
    } catch (error) {
        // Se deu erro e não foi erro de duplicidade do app, tentamos reverter o lock do usuário
        // Mas APENAS se o app não foi criado. Se o app foi criado (mongo create sucesso), não revertemos.
        // Como o try/catch pega tudo, precisamos saber se o app foi salvo.

        // Se erro for 11000 (duplicate key no Application), o app NÃO foi criado.
        // Se for outro erro antes do Application.create, também não.
        // Se for erro no deploy (dentro do if zipPath), o app JÁ FOI criado. 
        // A lógica original salvava o app antes do deploy.

        // O catch block original tratava erro 11000 de Application.create.
        // Se cair aqui, o userUpdate já rolou (flag = true).
        // Se o app não foi persistido, devemos liberar o flag.

        // Verificação simplificada:
        // Se o erro for 11000, o app já existia ou colidiu lock, mas nosso User lock passou primeiro.
        // Se o erro explodiu no Application.create (passo 1), devemos reverter user.

        if (error.code === 11000) {
            // Era pra ser único, colidiu. Reverte user flag para ele tentar de novo (ou se já tinha, o count check pegou antes)
            // Mas espere, se colidiu no app 11000, é pq já tinha app? 
            // Se já tinha app, o countDocuments devia ter pego? 
            // Race condition extrema. Reverte flag.
            await User.updateOne({ _id: req.user._id }, { $set: { freePlanRedeemed: false } });

            return res.status(400).json({
                success: false,
                error: "Limite atingido",
                message: "Você já possui uma aplicação gratuita. Apenas 1 permitida.",
            });
        }

        // Se o erro não for de app já existente (e não sabemos se o app foi salvo ou não facilmente aqui sem escopo),
        // uma abordagem segura é: se o app não existir no banco, libera.
        try {
            const appExists = await Application.exists({ botID: error.botID_context }); // Difícil ter esse contexto aqui
            // Simplificação: Se o erro ocorreu ANTES de salvar o app, o usuário perde o direito? Não deveria.
            // Mas como saber onde parou?
            // O código original fazia Application.create na linha 133.
            // Se falhar lá, cai aqui.
            // Vamos assumir que erros genericos aqui revertem o flag, A MENOS que o app tenha sido salvo.

            // Por segurança, deixamos o flag TRUE em caso de dúvida para evitar abuse, ou FALSE para evitar suporte?
            // O user pediu "marcado na db para que nao seja possivel resgatar novamente durante o processo".
            // Se falhar, ele deve poder tentar de novo.

            // Revertendo flag em caso de erro genérico (exceto se já sabemos que salvou)
            // O ideal seria transação, mas mongo standalone nem sempre tem.

            // Vamos checar se o usuário tem app free AGORA.
            const hasApp = await Application.exists({ userId: req.user._id, isFree: true, isDeleted: false });
            if (!hasApp) {
                await User.updateOne({ _id: req.user._id }, { $set: { freePlanRedeemed: false } });
            }

        } catch (revertError) {
            console.error("Erro ao tentar reverter flag freePlanRedeemed:", revertError);
        }

        console.error("[FREE APP CREATE] Erro:", error);
        res.status(500).json({
            success: false,
            error: "Erro ao criar aplicação",
            message: error.message,
        });
    }
});

/**
 * GET /apps/free/check
 * Verifica se usuário pode criar um app free
 */
router.get("/free/check", async (req, res) => {
    try {
        const userId = req.user._id;

        const existingFreeApp = await Application.countDocuments({
            userId,
            isFree: true,
            isDeleted: false,
        });

        res.json({
            success: true,
            canCreate: existingFreeApp === 0,
            existingCount: existingFreeApp,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: "Erro ao verificar",
        });
    }
});

export default router;
