import { Router, Request, Response } from "express";
import { isS3Mode } from "../services/storage";
import { isSmileConfigured } from "../services/smileIdentity";

const router = Router();

// GET /api/health — basic liveness check (public)
router.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "afrizone-server", time: new Date().toISOString() });
});

// GET /api/health/config — shows which services are live vs simulated (public)
// Useful during initial setup to know exactly what still needs to be configured.
router.get("/config", (_req: Request, res: Response) => {
  const jwt = process.env.JWT_SECRET ?? "";
  const dbUrl = process.env.DATABASE_URL ?? "";

  const services = {
    database: {
      ok: !!dbUrl,
      provider: dbUrl.startsWith("postgresql") || dbUrl.startsWith("postgres")
        ? "postgresql"
        : "sqlite",
      note: dbUrl.startsWith("file:")
        ? "SQLite — single-writer, dev only. Switch to Postgres for production."
        : dbUrl
        ? "Postgres configured."
        : "DATABASE_URL not set.",
    },
    jwt: {
      ok: jwt.length >= 32,
      note:
        jwt === "dev-secret-change-me"
          ? "INSECURE: using default dev secret. Rotate immediately."
          : jwt.length < 32
          ? "JWT_SECRET is too short (< 32 chars)."
          : "OK.",
    },
    paystack: {
      ok: !!process.env.PAYSTACK_SECRET,
      mode: process.env.PAYSTACK_SECRET ? "live" : "simulated",
      note: process.env.PAYSTACK_SECRET
        ? "Live payouts enabled."
        : "Simulated — withdrawals stay PROCESSING. Set PAYSTACK_SECRET to enable real transfers.",
    },
    sms: {
      ok: !!process.env.SMS_PROVIDER && !!process.env.TERMII_API_KEY,
      provider: process.env.SMS_PROVIDER || "simulated",
      note: process.env.SMS_PROVIDER
        ? `${process.env.SMS_PROVIDER} configured.`
        : "Simulated — devCode returned in OTP response, master code 123456 active. Set SMS_PROVIDER + keys.",
    },
    google: {
      ok: !!(process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
      note:
        process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
          ? "Google SSO enabled."
          : "Disabled — SSO buttons show 'not configured'. Set GOOGLE_WEB_CLIENT_ID to enable.",
    },
    smileIdentity: {
      ok: isSmileConfigured,
      note: isSmileConfigured
        ? "Document Verification (ID + selfie) enabled."
        : "Simulated — KYC relies on manual admin review only. Set SMILE_PARTNER_ID + SMILE_API_KEY to enable.",
    },
    smtp: {
      ok: !!process.env.SMTP_URL,
      note: process.env.SMTP_URL
        ? "Email delivery enabled."
        : "Simulated — devToken returned in reset response, link logged to console. Set SMTP_URL to enable email.",
    },
    storage: {
      ok: true,
      provider: isS3Mode ? "s3" : "local",
      note: isS3Mode
        ? `S3 enabled (bucket: ${process.env.S3_BUCKET}).`
        : "Local disk — uploads stored in server/uploads/. Set S3_BUCKET + AWS credentials for production.",
    },
  };

  const criticalIssues = [
    !services.jwt.ok && "JWT_SECRET insecure or missing",
    services.database.provider === "sqlite" && "SQLite — not suitable for production",
    !services.storage.ok && "Storage misconfigured",
  ].filter(Boolean);

  res.json({
    ready: criticalIssues.length === 0,
    criticalIssues,
    services,
  });
});

export default router;
