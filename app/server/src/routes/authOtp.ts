// Worker passwordless auth: phone + OTP. Mounted under /api/auth.
//
//   POST /api/auth/otp/request  { phone }        -> { sent: true, devCode? }
//   POST /api/auth/otp/verify   { phone, code }  -> { token, user, isNewUser }
//
// OTP codes are hashed (sha256) at rest, single-use, 10-min expiry,
// rate-limited to <=5 requests/hour/phone, and locked after >=5 wrong attempts.
// Dev/sim: code is returned as devCode when SMS is not configured; master code
// 123456 always works when NODE_ENV !== "production".

import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../prisma";
import { signToken, publicUser, hashPassword } from "../auth";
import { Role } from "../types";
import { sms } from "../services/sms";

const router = Router();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_ATTEMPTS = 5;
const MASTER_CODE = "123456";

const isDev = () => process.env.NODE_ENV !== "production";

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Loose E.164 normalisation: strip spaces/dashes, keep leading +.
function normalisePhone(raw: string): string {
  return String(raw).trim().replace(/[\s-]/g, "");
}

// POST /api/auth/register: email/password self-serve signup. Creates a WORKER
// (kycStatus PENDING) and returns a normal token. 409 if the email is taken.
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }
  if (String(name).trim().length < 2) {
    return res.status(400).json({ error: "Please enter your full name" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const normEmail = String(email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  const existing = await prisma.user.findUnique({ where: { email: normEmail } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await hashPassword(String(password));
  const user = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: normEmail,
      passwordHash,
      role: "WORKER",
      tiers: "",
      kycStatus: "PENDING",
    },
  });

  const token = signToken({ sub: user.id, role: user.role as Role, email: user.email });
  return res.json({ token, user: publicUser(user), isNewUser: true });
});

// POST /api/auth/otp/request
router.post("/otp/request", async (req, res) => {
  const phoneRaw = req.body?.phone;
  if (!phoneRaw) return res.status(400).json({ error: "phone is required" });
  const phone = normalisePhone(phoneRaw);
  if (!/^\+?\d{7,15}$/.test(phone)) {
    return res.status(400).json({ error: "Invalid phone number" });
  }

  // Rate limit: <=5 requests/hour/phone.
  const since = new Date(Date.now() - REQUEST_WINDOW_MS);
  const recent = await prisma.otpCode.count({
    where: { phone, purpose: "login", createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Too many OTP requests. Try again later." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otpCode.create({
    data: {
      phone,
      codeHash: hashCode(code),
      purpose: "login",
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  try {
    await sms.sendOtp(phone, code);
  } catch (e) {
    console.error("[otp] sms send failed:", e);
  }

  const payload: { sent: true; devCode?: string } = { sent: true };
  // Expose devCode only when SMS isn't really sending (sim) and not in prod.
  if (isDev() && !sms.enabled) payload.devCode = code;
  return res.json(payload);
});

// POST /api/auth/otp/verify
router.post("/otp/verify", async (req, res) => {
  const phoneRaw = req.body?.phone;
  const codeRaw = req.body?.code;
  if (!phoneRaw || !codeRaw) {
    return res.status(400).json({ error: "phone and code are required" });
  }
  const phone = normalisePhone(phoneRaw);
  const code = String(codeRaw).trim();

  // Master code shortcut in dev: bypasses the stored-code checks entirely.
  const masterOk = isDev() && code === MASTER_CODE;

  if (!masterOk) {
    const otp = await prisma.otpCode.findFirst({
      where: { phone, purpose: "login", consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) return res.status(400).json({ error: "Invalid or expired code" });

    if (otp.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Too many attempts. Request a new code." });
    }
    if (otp.expiresAt < new Date()) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }
    if (otp.codeHash !== hashCode(code)) {
      const attempts = otp.attempts + 1;
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts } });
      if (attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: "Too many attempts. Request a new code." });
      }
      return res.status(400).json({ error: "Invalid or expired code" });
    }
    // Correct: consume it.
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  }

  // Find or create the worker.
  let user = await prisma.user.findUnique({ where: { phone } });
  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    user = await prisma.user.create({
      data: {
        name: "New worker",
        email: `${phone.replace(/\D/g, "")}@phone.afrizone.local`, // placeholder, set in KYC
        phone,
        passwordHash: null,
        role: "WORKER",
        tiers: "",
        kycStatus: "PENDING",
      },
    });
  }

  const token = signToken({ sub: user.id, role: user.role as Role, email: user.email });
  return res.json({ token, user: publicUser(user), isNewUser });
});

export default router;
