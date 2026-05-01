import express from "express";
import authRoutes from "./auth/index.js";
import infoRoutes from "./info/index.js";
import adminRoutes from "./admin/index.js";
import paymentRoutes from "./payment/index.js";
import appsRoutes from "./apps/index.js";
import botRoutes from "./bot/index.js";
import giftsRoutes from "./gifts/index.js";
import invoicesRoutes from "./invoices/index.js";
import applicationsRoutes from "./applications/index.js";

const router = express.Router();
router.use("/auth", authRoutes);
router.use("/info", infoRoutes);
router.use("/admin", adminRoutes);
router.use("/payment", paymentRoutes);
router.use("/apps", appsRoutes);
router.use("/bot", botRoutes);
router.use("/gifts", giftsRoutes);
router.use("/invoices", invoicesRoutes);
router.use("/applications", applicationsRoutes);

export default router;