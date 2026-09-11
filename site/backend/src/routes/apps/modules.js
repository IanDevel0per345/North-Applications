import express from "express";
import Application from "../../database/models/Application.js";

const router = express.Router();

const ALLOWED_MODULES = new Set([
  "store",
  "ticket",
  "moderation",
  "automation",
  "giveaway",
  "payments",
  "channels",
  "roles",
  "backup",
  "extensions",
]);

const DEFAULTS = {
  store: {
    title: "Loja North Applications",
    message: "Produtos, planos e vendas configurados diretamente pelo painel.",
    options: { pix: true, coupons: true, stockControl: true, deliveryMode: "automatic" },
  },
  ticket: {
    title: "Atendimento North",
    message: "Abra um ticket e aguarde o atendimento da equipe.",
    options: { transcript: true, claimButton: true, closeConfirmation: true },
  },
  moderation: {
    title: "Protecao do servidor",
    message: "Acoes de moderacao e protecao gerenciadas pelo dashboard.",
    options: { antiSpam: true, antiInvite: true, autoMute: true },
  },
  automation: {
    title: "Automacoes",
    message: "Rotinas automaticas para boas-vindas, logs e avisos.",
    options: { welcome: true, logs: true, scheduledMessages: false },
  },
  giveaway: {
    title: "Sorteios",
    message: "Crie e acompanhe sorteios sem usar comandos no Discord.",
    options: { requireRole: false, autoEnd: true, winners: 1 },
  },
  payments: {
    title: "Pagamentos",
    message: "Configure metodos de pagamento e confirmacoes de venda.",
    options: { pix: true, manualApproval: false, receipts: true },
  },
  channels: {
    title: "Canais",
    message: "Defina os canais usados por loja, tickets, logs e avisos.",
    options: { syncOnSave: true },
  },
  roles: {
    title: "Cargos",
    message: "Defina cargos de cliente, suporte, moderacao e permissao.",
    options: { customerRole: "", supportRole: "", adminRole: "" },
  },
  backup: {
    title: "Backup",
    message: "Controle backups das configuracoes do bot e do servidor.",
    options: { automatic: true, intervalHours: 24 },
  },
  extensions: {
    title: "Extensoes",
    message: "Ative recursos extras em um unico bot.",
    options: { boost: false, giveaways: true, tickets: true },
  },
};

function normalizeModule(key, raw = {}) {
  const fallback = DEFAULTS[key] || {};
  return {
    enabled: Boolean(raw.enabled ?? false),
    channelId: String(raw.channelId ?? ""),
    roleId: String(raw.roleId ?? ""),
    logChannelId: String(raw.logChannelId ?? ""),
    title: String(raw.title ?? fallback.title ?? ""),
    message: String(raw.message ?? fallback.message ?? ""),
    options:
      raw.options && typeof raw.options === "object" && !Array.isArray(raw.options)
        ? { ...(fallback.options || {}), ...raw.options }
        : { ...(fallback.options || {}) },
    updatedAt: raw.updatedAt || null,
    updatedBy: raw.updatedBy || null,
  };
}

function sanitizePayload(key, body = {}) {
  const current = normalizeModule(key, body);
  return {
    enabled: current.enabled,
    channelId: current.channelId.trim(),
    roleId: current.roleId.trim(),
    logChannelId: current.logChannelId.trim(),
    title: current.title.trim().slice(0, 80),
    message: current.message.trim().slice(0, 1000),
    options: current.options,
  };
}

async function findPermittedApp(req, appId) {
  const userId = req.user?._id;
  const userDiscordId = req.user?.discordId;
  return Application.findOne({
    _id: appId,
    $or: [{ userId }, { "bot.perms": userDiscordId || "__none__" }],
  });
}

router.get("/:id/modules", async (req, res) => {
  try {
    const app = await findPermittedApp(req, req.params.id);
    if (!app) return res.status(404).json({ error: "Aplicação não encontrada" });

    const modules = {};
    for (const key of ALLOWED_MODULES) {
      modules[key] = normalizeModule(key, app.modules?.[key]);
    }

    return res.json({ modules });
  } catch (error) {
    return res.status(400).json({ error: "Erro ao buscar módulos" });
  }
});

router.get("/:id/modules/:module", async (req, res) => {
  try {
    const { module } = req.params;
    if (!ALLOWED_MODULES.has(module)) {
      return res.status(404).json({ error: "Módulo não encontrado" });
    }

    const app = await findPermittedApp(req, req.params.id);
    if (!app) return res.status(404).json({ error: "Aplicação não encontrada" });

    return res.json({ module: normalizeModule(module, app.modules?.[module]) });
  } catch (error) {
    return res.status(400).json({ error: "Erro ao buscar módulo" });
  }
});

router.put("/:id/modules/:module", async (req, res) => {
  try {
    const { module } = req.params;
    if (!ALLOWED_MODULES.has(module)) {
      return res.status(404).json({ error: "Módulo não encontrado" });
    }

    const app = await findPermittedApp(req, req.params.id);
    if (!app) return res.status(404).json({ error: "Aplicação não encontrada" });

    const payload = sanitizePayload(module, req.body);
    app.set(`modules.${module}`, {
      ...payload,
      updatedBy: req.user?._id || null,
      updatedAt: new Date(),
    });
    await app.save();

    return res.json({ module: normalizeModule(module, app.modules?.[module]) });
  } catch (error) {
    return res.status(400).json({ error: "Erro ao salvar módulo" });
  }
});

export default router;
