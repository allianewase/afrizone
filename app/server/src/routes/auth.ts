import { Router } from "express";
import { login, me, requireAuth } from "../auth";
import otpRouter from "./authOtp";
import adminRouter from "./authAdmin";

const router = Router();

router.post("/login", login);
router.get("/me", requireAuth, me);

// Worker phone-OTP + admin 2FA/Google/password-reset (all under /api/auth).
router.use("/", otpRouter);
router.use("/", adminRouter);

export default router;
