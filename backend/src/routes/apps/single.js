import express from "express";
import Application from "../../database/models/Application.js";

const router = express.Router();

// GET /apps/:id - detalhes de uma app do usuário
router.get("/:id", async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    const app = await Application.findOne({ _id: id, userId })
      .select({
        name: 1,
        botID: 1,
        plan: { id: 1, name: 1, months: 1 },
        hosting: { appId: 1 },
        bot: { id: 1, owner: 1, server: 1, perms: 1, token: 1 }, // token somente para calcular configured
        info: { name: 1, imageUrl: 1 },
        expiresAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean();
    if (!app) return res.status(404).json({ error: "Aplicação não encontrada" });

    const response = {
      _id: app._id,
      name: app.name,
      botID: app.botID || null,
      plan: {
        id: app.plan?.id,
        name: app.plan?.name,
        months: app.plan?.months,
      },
      hosting: {
        appId: app?.hosting?.appId || null,
      },
      bot: {
        id: app.bot?.id || null,
        owner: app.bot?.owner || null,
        server: app.bot?.server || null,
        perms: Array.isArray(app.bot?.perms) ? app.bot.perms : [],
        configured: Boolean(app?.bot?.token || ""),
      },
      info: {
        name: app.info?.name || "Vision Pro",
        imageUrl: app.info?.imageUrl || "/vision.png",
      },
      expiresAt: app.expiresAt || null,
      createdAt: app?.createdAt || null,
      updatedAt: app?.updatedAt || null,
    };

    res.json({ application: response });
  } catch (e) {
    res.status(400).json({ error: "Erro ao buscar aplicação" });
  }
});

export default router;


