import express from "express";
import authMiddleware from "../../../middlewares/authMiddleware.js";
import requireAdmin from "../../../middlewares/requireAdmin.js";
import startRoute from "./start.js";
import progressRoute from "./progress.js";
import listRoute from "./list.js";
import exportRoute from "./export.js";

const router = express.Router();

// Todas as rotas exigem autenticação + admin
router.use(authMiddleware, requireAdmin);

router.use("/start", startRoute);
router.use("/progress", progressRoute);
router.use("/list", listRoute);
router.use("/export", exportRoute);

export default router;
