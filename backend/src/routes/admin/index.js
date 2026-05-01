import express from "express";
import plansAdminRoute from "./plans/index.js";
import couponsAdminRoute from "./coupons/index.js";
import usersAdminRoute from "./users/index.js";
import paymentsAdminRoute from "./payments/index.js";
import botAdminRoute from "./bot/index.js";
import giftsAdminRoute from "./gifts/index.js";
import updatesAdminRoute from "./updates/index.js";
import applicationsAdminRoute from "./applications/index.js";
import cacheAdminRoute from "./cache.js";

const router = express.Router();

router.use("/plans", plansAdminRoute);
router.use("/coupons", couponsAdminRoute);
router.use("/users", usersAdminRoute);
router.use("/payments", paymentsAdminRoute);
router.use("/bot", botAdminRoute);
router.use("/gifts", giftsAdminRoute);
router.use("/updates", updatesAdminRoute);
router.use("/applications", applicationsAdminRoute);
router.use("/cache", cacheAdminRoute);

export default router;


