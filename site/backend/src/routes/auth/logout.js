import express from "express";
import authMiddleware from "../../middlewares/authMiddleware.js";
import User from "../../database/models/User.js";

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {
  try {
    // Increment tokenVersion to revoke all existing tokens
    await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
  } catch {}

  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
  });
  return res.json({ ok: true });
});

export default router;
