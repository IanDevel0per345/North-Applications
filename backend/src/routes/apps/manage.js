import express from "express";
import { discloud } from "discloud.app";
import Application from "../../database/models/Application.js";
import discloudCache from "../../services/discloud/cache.js";

const router = express.Router();

async function performAction(action, appId) {
  await discloud.login(process.env.DISCLOUD_TOKEN);
  switch (action) {
    case "start":
      await discloud.apps.start(appId);
      break;
    case "stop":
      await discloud.apps.stop(appId);
      break;
    case "restart":
      await discloud.apps.restart(appId);
      break;
    default:
      throw new Error("Ação inválida");
  }

  // Try to fetch the latest status after the action
  try {
    const status = await discloud.apps.status(appId);
    const container = status?.container;
    if (typeof container === "string") {
      const c = container.toLowerCase();
      return c === "online" ? "running" : c;
    }
  } catch { }
  return null;
}

async function handleManage(req, res, action) {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const app = await Application.findOne({ _id: id, userId })
      .select({ hosting: { appId: 1 }, "bot.token": 1, "bot.server": 1, isBlocked: 1, isDeleted: 1, expiresAt: 1 })
      .lean();

    if (!app) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    // Guard: bloqueia ações se a aplicação estiver bloqueada
    if (app.isBlocked && (action === "start" || action === "restart")) {
      return res.status(403).json({
        error: "Aplicação bloqueada por vencimento",
        errorCode: "APP_BLOCKED",
        message: "Sua aplicação foi bloqueada por vencimento. Renove para desbloquear.",
        expiresAt: app.expiresAt
      });
    }

    // Guard: bloqueia ações se a aplicação estiver deletada
    if (app.isDeleted) {
      return res.status(403).json({
        error: "Aplicação deletada",
        errorCode: "APP_DELETED",
        message: "Sua aplicação foi deletada. Entre em contato com o suporte."
      });
    }

    const appId = app?.hosting?.appId;
    if (!appId) {
      return res.status(400).json({ error: "Aplicação sem provider/appId vinculado" });
    }

    // Guard: block starting/restarting when bot is not configured
    const botConfigured = Boolean(app?.bot?.token || "");
    if ((action === "start" || action === "restart") && !botConfigured) {
      return res.status(400).json({ error: "Bot não configurado", errorCode: "BOT_NOT_CONFIGURED" });
    }

    // Guard: block starting/restarting when server is not configured
    const serverConfigured = Boolean(app?.bot?.server || "");
    if ((action === "start" || action === "restart") && !serverConfigured) {
      return res.status(400).json({ error: "Servidor não configurado", errorCode: "SERVER_NOT_CONFIGURED" });
    }

    const status = await performAction(action, appId);

    // Atualiza lastStartedAt quando bot é ligado (para rastrear inatividade de planos free)
    if (action === "start" || action === "restart") {
      await Application.findByIdAndUpdate(id, {
        $set: {
          lastStartedAt: new Date(),
          inactivityWarningSentAt: null, // Limpa aviso de inatividade
        },
      });
    }

    // Se for restart, marca app como reiniciando no cache
    if (action === "restart") {
      discloudCache.markAsRestarting(appId);
    }

    return res.json({ ok: true, status });
  } catch (e) {
    return res.status(400).json({ error: `Falha ao ${action} aplicação` });
  }
}

router.post("/:id/start", (req, res) => handleManage(req, res, "start"));
router.post("/:id/stop", (req, res) => handleManage(req, res, "stop"));
router.post("/:id/restart", (req, res) => handleManage(req, res, "restart"));

export default router;


