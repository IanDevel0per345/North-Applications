import express from "express";
import Application from "../../../database/models/Application.js";
import Plan from "../../../database/models/Plan.js";
import { updateBotWithConfig } from "../../../services/botDeployment.js";
import path from "path";

const router = express.Router();

/**
 * POST /admin/bot/:applicationId/redeploy
 * Re-faz deploy do bot com config.json atualizado
 */
router.post("/:applicationId/redeploy", async (req, res) => {
  try {
    const { applicationId } = req.params;

    // Busca aplicação
    const app = await Application.findById(applicationId).lean();
    if (!app) {
      return res.status(404).json({ error: "Aplicação não encontrada" });
    }

    const appId = app.hosting?.appId;
    if (!appId) {
      return res.status(400).json({ error: "Aplicação sem appId da Discloud" });
    }

    const botID = app.botID;
    if (!botID) {
      return res.status(400).json({ error: "Aplicação sem botID vinculado" });
    }

    // Busca plano para pegar o ZIP
    const plan = await Plan.findOne({ id: app.plan?.id }).lean();
    if (!plan || !plan.zipFilename) {
      return res.status(404).json({ error: "Plano ou ZIP não encontrado" });
    }

    const zipPath = path.resolve(process.cwd(), "src/database/zip", plan.zipFilename);

    // Re-deploy com config.json atualizado
    const result = await updateBotWithConfig(appId, zipPath, botID);

    return res.json({
      success: true,
      message: "Re-deploy realizado com sucesso",
      result,
    });
  } catch (err) {
    console.error("[admin/bot/redeploy]", err);
    return res.status(500).json({ error: "Erro ao fazer re-deploy", details: err.message });
  }
});

export default router;
