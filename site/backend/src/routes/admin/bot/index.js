import express from "express";
import redeployRoute from "./redeploy.js";

const router = express.Router();

router.use("/", redeployRoute);

export default router;
