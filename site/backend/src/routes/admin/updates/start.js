import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { startMassUpdate } from "../../../services/massUpdate.js";

const router = express.Router();

// Configuração do multer para upload do ZIP
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(process.cwd(), "src/temp/updates");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `update-${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos ZIP são permitidos"));
    }
  },
});

/**
 * POST /admin/updates/start
 * Inicia uma atualização em massa
 */
router.post("/", upload.single("file"), (err, req, res, next) => {
  if (err) {
    console.error("[ADMIN UPDATES] Erro no upload do arquivo:", err);
    return res.status(400).json({
      success: false,
      message: "Erro no upload do arquivo",
      error: err.message,
    });
  }
  next();
}, async (req, res) => {
  console.log(`[ADMIN UPDATES] Nova requisição de atualização recebida`);
  console.log(`[ADMIN UPDATES] Body:`, req.body);
  console.log(`[ADMIN UPDATES] File:`, req.file ? { name: req.file.originalname, size: req.file.size } : 'Nenhum arquivo');
  console.log(`[ADMIN UPDATES] User:`, req.user);
  
  try {
    const { planId, updateVersion } = req.body;
    const adminUserId = req.user?._id;

    if (!planId) {
      console.warn(`[ADMIN UPDATES] Requisição rejeitada - planId não fornecido`);
      return res.status(400).json({
        success: false,
        message: "planId é obrigatório",
      });
    }

    if (!req.file) {
      console.warn(`[ADMIN UPDATES] Requisição rejeitada - Arquivo ZIP não fornecido`);
      return res.status(400).json({
        success: false,
        message: "Arquivo ZIP é obrigatório",
      });
    }

    console.log(`[ADMIN UPDATES] Iniciando atualização em massa - Plano: ${planId}, Versão: ${updateVersion || 'AUTO'}, Admin: ${adminUserId}`);

    const updateId = await startMassUpdate(planId, req.file.path, adminUserId, updateVersion);

    console.log(`[ADMIN UPDATES] Atualização iniciada com sucesso - UpdateID: ${updateId}`);

    return res.status(200).json({
      success: true,
      message: "Atualização iniciada com sucesso",
      data: {
        updateId,
      },
    });
  } catch (error) {
    console.error("[ADMIN UPDATES] Erro ao iniciar atualização:", error);
    console.error("[ADMIN UPDATES] Stack trace:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Erro ao iniciar atualização",
      error: error.message,
    });
  }
});

export default router;
