import { Router } from "express";
import mongoose from "mongoose";
import Application from "../../../database/models/Application.js";
import User from "../../../database/models/User.js";
import BotConfig from "../../../database/models/BotConfig.js";
import discloudService from "../../../services/discloudService.js";
import auditService from "../../../services/auditService.js";
import authMiddleware from "../../../middlewares/authMiddleware.js";
import requireAdmin from "../../../middlewares/requireAdmin.js";

const router = Router();

// Middleware de autenticação e admin em todas as rotas
router.use(authMiddleware, requireAdmin);

/**
 * Valida se um ID é um ObjectId válido do MongoDB
 */
function validateObjectId(id, res) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: "ID inválido" });
    return false;
  }
  return true;
}

/**
 * GET /api/admin/applications
 * Lista todas as aplicações com filtros
 */
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      status = "",
      planId = "",
      userId = "",
      expired = "",
      blocked = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isDeleted: false };

    // Filtros
    if (search) {
      // Verifica se é um Discord ID (números)
      if (/^\d+$/.test(search)) {
        // Busca usuário pelo Discord ID
        const userByDiscord = await User.findOne({ discordId: search }).select("_id").lean();
        
        query.$or = [
          { "bot.owner": search },
          { "bot.id": search },
          { name: new RegExp(search, "i") },
          { "hosting.appId": new RegExp(search, "i") },
          { botID: new RegExp(search, "i") },
        ];
        
        // Se encontrou usuário, adiciona busca por userId
        if (userByDiscord) {
          query.$or.push({ userId: userByDiscord._id });
        }
      } else {
        query.$or = [
          { name: new RegExp(search, "i") },
          { "bot.id": new RegExp(search, "i") },
          { "bot.owner": new RegExp(search, "i") },
          { "hosting.appId": new RegExp(search, "i") },
          { botID: new RegExp(search, "i") },
          { "plan.name": new RegExp(search, "i") },
          { "plan.id": new RegExp(search, "i") },
        ];
      }
    }

    if (status) {
      query["hosting.status"] = status;
    }

    if (planId) {
      query["plan.id"] = planId;
    }

    if (userId) {
      query.userId = userId;
    }

    if (expired === "true") {
      query.expiresAt = { $lt: new Date() };
    } else if (expired === "false") {
      query.expiresAt = { $gte: new Date() };
    }

    if (blocked === "true") {
      query.isBlocked = true;
    } else if (blocked === "false") {
      query.isBlocked = false;
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [applications, total] = await Promise.all([
      Application.find(query)
        .populate("userId", "username email discordId avatar")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Application.countDocuments(query),
    ]);

    // Não busca mais status automaticamente para evitar rate limit
    // O frontend terá um botão "Ver na Discloud" para cada app

    res.json({
      success: true,
      applications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao listar aplicações:", error);
    res.status(500).json({ error: "Erro ao listar aplicações" });
  }
});

/**
 * GET /api/admin/applications/:id
 * Busca detalhes completos de uma aplicação
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Valida se é um ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const application = await Application.findById(id)
      .populate("userId", "username email discordId avatar")
      .populate("paymentId")
      .lean();

    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    // Busca BotConfig
    let botConfig = null;
    if (application.botID) {
      botConfig = await BotConfig.findOne({ botID: application.botID }).lean();
    }

    // Busca informações da Discloud
    let discloudInfo = null;
    let discloudStatus = null;
    if (application.hosting?.appId) {
      const [infoResult, statusResult] = await Promise.all([
        discloudService.getAppInfo(application.hosting.appId),
        discloudService.getAppStatus(application.hosting.appId),
      ]);

      if (infoResult.success) {
        discloudInfo = infoResult.app;
      }
      if (statusResult.success) {
        discloudStatus = statusResult.status;
      }
    }

    res.json({
      success: true,
      application,
      botConfig,
      discloudInfo,
      discloudStatus,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao buscar aplicação:", error);
    res.status(500).json({ error: "Erro ao buscar aplicação" });
  }
});

/**
 * PUT /api/admin/applications/:id
 * Atualiza dados de uma aplicação
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const updates = req.body;
    const adminId = String(req.user?._id || "");

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    // Campos permitidos para atualização - CONTROLE TOTAL
    const allowedFields = [
      "name",
      "expiresAt",
      "isBlocked",
      "blockedAt",
      "canRecover",
      "plan",
      "hosting",
      "bot",
      "info",
      "botID",
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    // Se está atualizando o bot.token, atualiza também no BotConfig
    if (updates.bot?.token && application.botID) {
      const BotConfig = (await import("../../../database/models/BotConfig.js")).default;
      // Garante que o owner esteja sempre nas permissões
      const targetOwner = updates.bot.owner || application.bot?.owner || "";
      const incomingPerms = Array.isArray(updates.bot.perms) ? updates.bot.perms : (Array.isArray(application.bot?.perms) ? application.bot.perms : []);
      const newPerms = Array.from(new Set([ ...(incomingPerms || []).filter(Boolean), ...(targetOwner ? [String(targetOwner)] : []) ]));
      await BotConfig.findOneAndUpdate(
        { botID: application.botID },
        { 
          "bot.token": updates.bot.token,
          "bot.owner": targetOwner,
          "bot.id": updates.bot.id || application.bot?.id,
          "bot.perms": newPerms,
          "bot.server": updates.bot.server || application.bot?.server,
        }
      );
    }

    // Atualiza a aplicação
    Object.assign(application, updateData);
    await application.save();

    // Registra auditoria
    await auditService.log(
      "application",
      "update",
      adminId,
      id,
      {
        updates: updateData,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: "Aplicação atualizada com sucesso",
      application,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao atualizar aplicação:", error);
    res.status(500).json({ error: "Erro ao atualizar aplicação" });
  }
});

/**
 * POST /api/admin/applications/:id/block
 * Bloqueia uma aplicação
 */
router.post("/:id/block", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const { reason } = req.body || {};
    const adminId = String(req.user?._id || "");

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (application.isBlocked) {
      return res.status(400).json({ error: "Aplicação já está bloqueada" });
    }

    application.isBlocked = true;
    application.blockedAt = new Date();
    await application.save();

    // Para a aplicação na Discloud se estiver rodando
    if (application.hosting?.appId) {
      await discloudService.stopApp(application.hosting.appId);
    }

    // Registra auditoria
    await auditService.log(
      "application",
      "block",
      adminId,
      id,
      {
        reason,
        appId: application.hosting?.appId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: "Aplicação bloqueada com sucesso",
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao bloquear aplicação:", error);
    res.status(500).json({ error: "Erro ao bloquear aplicação" });
  }
});

/**
 * POST /api/admin/applications/:id/unblock
 * Desbloqueia uma aplicação
 */
router.post("/:id/unblock", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const adminId = String(req.user?._id || "");

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (!application.isBlocked) {
      return res.status(400).json({ error: "Aplicação não está bloqueada" });
    }

    application.isBlocked = false;
    application.blockedAt = null;
    await application.save();

    // Inicia a aplicação na Discloud se estava parada
    if (application.hosting?.appId) {
      await discloudService.startApp(application.hosting.appId);
    }

    // Registra auditoria
    await auditService.log(
      "application",
      "unblock",
      adminId,
      id,
      {
        appId: application.hosting?.appId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: "Aplicação desbloqueada com sucesso",
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao desbloquear aplicação:", error);
    res.status(500).json({ error: "Erro ao desbloquear aplicação" });
  }
});

/**
 * DELETE /api/admin/applications/:id
 * Deleta uma aplicação com opções
 * Query params:
 * - deleteFrom: "database" | "discloud" | "both"
 * - permanent: true/false (para database)
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const { 
      deleteFrom = "database", // "database", "discloud", "both"
      permanent = false 
    } = req.query;
    const adminId = String(req.user?._id || "");

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    let discloudDeleted = false;
    let databaseDeleted = false;

    // Deleta da Discloud se solicitado
    if ((deleteFrom === "discloud" || deleteFrom === "both") && application.hosting?.appId) {
      const deleteResult = await discloudService.deleteApp(application.hosting.appId);
      if (deleteResult.success) {
        discloudDeleted = true;
        // Remove o appId da aplicação já que foi deletada da Discloud
        application.hosting.appId = null;
        application.hosting.status = "deleted";
        await application.save();
      } else {
        console.error("Erro ao deletar da Discloud:", deleteResult.error);
        if (deleteFrom === "discloud") {
          return res.status(500).json({ 
            error: `Erro ao deletar da Discloud: ${deleteResult.error}` 
          });
        }
      }
    }

    // Deleta do database se solicitado
    if (deleteFrom === "database" || deleteFrom === "both") {
      if (permanent) {
        // Hard delete - remove completamente
        await Application.deleteOne({ _id: id });
        
        // Remove BotConfig associado
        if (application.botID) {
          await BotConfig.deleteOne({ botID: application.botID });
        }
        databaseDeleted = true;
      } else {
        // Soft delete - apenas marca como deletado
        application.isDeleted = true;
        application.deletedAt = new Date();
        await application.save();
        databaseDeleted = true;
      }
    }

    // Registra auditoria
    await auditService.log(
      "application",
      `delete_${deleteFrom}${permanent ? "_permanent" : ""}`,
      adminId,
      id,
      {
        appId: application.hosting?.appId,
        botID: application.botID,
        deleteFrom,
        permanent,
        discloudDeleted,
        databaseDeleted,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: `Aplicação deletada: ${
        discloudDeleted && databaseDeleted ? "Discloud e Database" :
        discloudDeleted ? "Discloud apenas" :
        databaseDeleted ? (permanent ? "Database (permanente)" : "Database (soft delete)") :
        "Nenhuma ação realizada"
      }`,
      details: {
        discloudDeleted,
        databaseDeleted,
        permanent: deleteFrom === "database" || deleteFrom === "both" ? permanent : null,
      }
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao deletar aplicação:", error);
    res.status(500).json({ error: "Erro ao deletar aplicação" });
  }
});

/**
 * POST /api/admin/applications/:id/restore
 * Restaura uma aplicação deletada
 */
router.post("/:id/restore", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const adminId = String(req.user?._id || "");

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (!application.isDeleted) {
      return res.status(400).json({ error: "Aplicação não está deletada" });
    }

    if (!application.canRecover) {
      return res.status(400).json({ error: "Aplicação não pode ser recuperada" });
    }

    application.isDeleted = false;
    application.deletedAt = null;
    await application.save();

    // Registra auditoria
    await auditService.log(
      "application",
      "restore",
      adminId,
      id,
      {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: "Aplicação restaurada com sucesso",
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao restaurar aplicação:", error);
    res.status(500).json({ error: "Erro ao restaurar aplicação" });
  }
});

/**
 * POST /api/admin/applications/:id/restart
 * Reinicia uma aplicação na Discloud
 */
router.post("/:id/restart", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const adminId = String(req.user?._id || "");

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (!application.hosting?.appId) {
      return res.status(400).json({ error: "Aplicação não tem ID da Discloud" });
    }

    const result = await discloudService.restartApp(application.hosting.appId);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Registra auditoria
    await auditService.log(
      "application",
      "restart",
      adminId,
      id,
      {
        appId: application.hosting.appId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao reiniciar aplicação:", error);
    res.status(500).json({ error: "Erro ao reiniciar aplicação" });
  }
});

/**
 * POST /api/admin/applications/:id/stop
 * Para uma aplicação na Discloud
 */
router.post("/:id/stop", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const adminId = String(req.user?._id || "");

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (!application.hosting?.appId) {
      return res.status(400).json({ error: "Aplicação não tem ID da Discloud" });
    }

    const result = await discloudService.stopApp(application.hosting.appId);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Registra auditoria
    await auditService.log(
      "application",
      "stop",
      adminId,
      id,
      {
        appId: application.hosting.appId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao parar aplicação:", error);
    res.status(500).json({ error: "Erro ao parar aplicação" });
  }
});

/**
 * POST /api/admin/applications/:id/start
 * Inicia uma aplicação na Discloud
 */
router.post("/:id/start", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const adminId = req.user?.id || req.user?.discordId;

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (!application.hosting?.appId) {
      return res.status(400).json({ error: "Aplicação não tem ID da Discloud" });
    }

    const result = await discloudService.startApp(application.hosting.appId);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Registra auditoria
    await auditService.log(
      "application",
      "start",
      adminId,
      id,
      {
        appId: application.hosting.appId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao iniciar aplicação:", error);
    res.status(500).json({ error: "Erro ao iniciar aplicação" });
  }
});

/**
 * GET /api/admin/applications/:id/logs
 * Busca logs de uma aplicação na Discloud
 */
router.get("/:id/logs", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (!application.hosting?.appId) {
      return res.status(400).json({ error: "Aplicação não tem ID da Discloud" });
    }

    const result = await discloudService.getAppLogs(application.hosting.appId);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      logs: result.logs,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao buscar logs:", error);
    res.status(500).json({ error: "Erro ao buscar logs" });
  }
});

/**
 * PUT /api/admin/applications/:id/ram
 * Altera RAM de uma aplicação
 */
router.put("/:id/ram", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    
    const { ram } = req.body;
    const adminId = String(req.user?._id || "");

    if (!ram || ram < 100 || ram > 1024) {
      return res.status(400).json({ error: "RAM deve estar entre 100 e 1024 MB" });
    }

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    if (!application.hosting?.appId) {
      return res.status(400).json({ error: "Aplicação não tem ID da Discloud" });
    }

    const result = await discloudService.changeAppRam(application.hosting.appId, ram);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Atualiza no banco
    application.hosting.ram = ram;
    await application.save();

    // Registra auditoria
    await auditService.log(
      "application",
      "change_ram",
      adminId,
      id,
      {
        appId: application.hosting.appId,
        oldRam: application.hosting.ram,
        newRam: ram,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    );

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao alterar RAM:", error);
    res.status(500).json({ error: "Erro ao alterar RAM" });
  }
});

/**
 * GET /api/admin/applications/audit/logs
 * Busca logs de auditoria de aplicações
 */
router.get("/audit/logs", async (req, res) => {
  try {
    const {
      action,
      targetId,
      actorId,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;

    const result = await auditService.getLogs(
      {
        entity: "application",
        action,
        targetId,
        actorId,
        from,
        to,
      },
      {
        page: parseInt(page),
        limit: parseInt(limit),
      }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao buscar auditoria:", error);
    res.status(500).json({ error: "Erro ao buscar auditoria" });
  }
});

/**
 * GET /api/admin/applications/stats
 * Estatísticas de aplicações
 */
router.get("/stats", async (req, res) => {
  try {
    const [
      total,
      active,
      expired,
      blocked,
      deleted,
      byPlan,
      recentCreated,
      recentExpired,
    ] = await Promise.all([
      Application.countDocuments({ isDeleted: false }),
      Application.countDocuments({ 
        isDeleted: false, 
        expiresAt: { $gte: new Date() },
        isBlocked: false,
      }),
      Application.countDocuments({ 
        isDeleted: false, 
        expiresAt: { $lt: new Date() },
      }),
      Application.countDocuments({ 
        isDeleted: false, 
        isBlocked: true,
      }),
      Application.countDocuments({ isDeleted: true }),
      Application.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: "$plan.name", count: { $sum: 1 } } },
      ]),
      Application.find({ isDeleted: false })
        .sort("-createdAt")
        .limit(5)
        .populate("userId", "username")
        .lean(),
      Application.find({ 
        isDeleted: false,
        expiresAt: { 
          $gte: new Date(),
          $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Próximos 7 dias
        },
      })
        .sort("expiresAt")
        .limit(5)
        .populate("userId", "username")
        .lean(),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        active,
        expired,
        blocked,
        deleted,
        byPlan: byPlan.reduce((acc, item) => {
          acc[item._id || "Sem plano"] = item.count;
          return acc;
        }, {}),
        recentCreated,
        recentExpired,
      },
    });
  } catch (error) {
    console.error("[ADMIN] Erro ao buscar estatísticas:", error);
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

export default router;
