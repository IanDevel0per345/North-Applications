import express from "express";
import Application from "../../database/models/Application.js";
import infoApp from "../../services/discloud/info.js";
import { getPermissionsFlags, isPermittedUser, isSiteOwner } from "../../utils/authz.js";

const router = express.Router();

// GET /apps/:id/info - informações sanitizadas da app do usuário
router.get("/:id/info", async (req, res) => {
  try {
    const userId = req.user?._id;
    const userDiscordId = req.user?.discordId;
    const { id } = req.params;
    // Permite acesso se for dono do site ou se tiver perm no bot
    const app = await Application.findOne({
      _id: id,
      $or: [{ userId }, { "bot.perms": userDiscordId || "__none__" }],
    })
      .select({
        name: 1,
        plan: { id: 1, name: 1, months: 1 },
        hosting: { appId: 1 },
        bot: { id: 1, owner: 1, server: 1, perms: 1, token: 1 }, // token apenas para calcular configured
        info: { name: 1, imageUrl: 1 },
        expiresAt: 1,
        userId: 1,
      })
      .lean();

    if (!app) return res.status(404).json({ error: "Aplicação não encontrada" });

    // Coleta status e RAM em uso do provedor (Discloud)
    let hostingStatus = null;
    let utilizedRam = null;
    let hostingStartedAt = null; // ISO string quando online
    try {
      const appId = app?.hosting?.appId;
      if (appId) {
        const info = await infoApp(appId);
        const container = info?.status?.container;
        if (typeof container === "string") {
          const c = container.toLowerCase();
          hostingStatus = c === "online" ? "running" : c;
        }

        // Descobrir quando iniciou (uptime) quando estiver online
        try {
          const isRunning =
            typeof hostingStatus === "string" &&
            ["running", "online", "on", "active"].includes(
              hostingStatus.toLowerCase()
            );
          if (isRunning) {
            const tsRaw = info?.status?.startedAtTimestamp;
            const startedRaw = info?.status?.startedAt;
            let startedMs = null;

            const numTs = Number(tsRaw);
            if (Number.isFinite(numTs) && numTs > 0) {
              // Aceita tanto segundos quanto milissegundos
              startedMs = numTs < 1e12 ? numTs * 1000 : numTs;
            } else if (startedRaw) {
              const d =
                startedRaw instanceof Date
                  ? startedRaw
                  : new Date(startedRaw);
              if (!Number.isNaN(d.getTime())) {
                startedMs = d.getTime();
              }
            }

            if (startedMs && startedMs > 0) {
              hostingStartedAt = new Date(startedMs).toISOString();
            }
          }
        } catch {}

        const totalRam = Number(info?.app?.ram);
        const usagePct = Number(info?.status?.memoryUsage);
        if (!Number.isNaN(totalRam) && !Number.isNaN(usagePct) && totalRam > 0) {
          utilizedRam = Math.round((usagePct / 100) * totalRam);
        } else if (typeof info?.status?.memory === "string") {
          // Fallback: parse "59.6MB/200MB"
          const match = info.status.memory.match(/([0-9]+\.?[0-9]*)\s*MB/i);
          if (match) utilizedRam = Math.round(parseFloat(match[1]));
        }
      }
    } catch {}

    // Flags de permissão
    const permsFlags = getPermissionsFlags(app, req.user);

    const response = {
      _id: app._id,
      name: app.name,
      plan: {
        id: app.plan?.id,
        name: app.plan?.name,
        months: app.plan?.months,
      },
      hosting: {
        utilizedRam,
        status: hostingStatus,
        startedAt: hostingStartedAt,
      },
      bot: {
        id: app.bot?.id || null,
        owner: app.bot?.owner || null,
        server: app.bot?.server || null,
        // Garante que owner esteja presente na resposta (segurança adicional)
        perms: (() => {
          const arr = Array.isArray(app.bot?.perms) ? app.bot.perms.slice() : [];
          const owner = app.bot?.owner;
          if (owner && !arr.includes(owner)) arr.push(owner);
          return arr;
        })(),
        configured: Boolean(app?.bot?.token || ""),
      },
      info: {
        name: app.info?.name || "Vision Pro",
        imageUrl: app.info?.imageUrl || "/vision.png",
      },
      expiresAt: app.expiresAt || null,
      permissions: permsFlags,
    };

    res.json({ application: response });
  } catch (e) {
    res.status(400).json({ error: "Erro ao buscar aplicação" });
  }
});

export default router;


