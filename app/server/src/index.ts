import "dotenv/config";
import path from "path";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";

import authRouter from "./routes/auth";
import dashboardRouter from "./routes/dashboard";
import tasksRouter from "./routes/tasks";
import applicationsRouter from "./routes/applications";
import timesheetsRouter from "./routes/timesheets";
import paymentsRouter from "./routes/payments";
import workersRouter from "./routes/workers";
import jobsRouter from "./routes/jobs";
import candidatesRouter from "./routes/candidates";
import reportsRouter from "./routes/reports";
import settingsRouter from "./routes/settings";
import meRouter from "./routes/me";
import clockRouter from "./routes/clock";
import walletRouter from "./routes/wallet";
import contractsRouter from "./routes/contracts";
import disputesRouter, { adminRouter as adminDisputesRouter } from "./routes/disputes";
import ratingsRouter from "./routes/ratings";
import webhooksRouter from "./routes/webhooks";
import kycDocumentsRouter from "./routes/kycDocuments";
import searchRouter from "./routes/search";
import healthRouter from "./routes/health";
import fundingRouter from "./routes/funding";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// CORS — Vite admin dev server, Expo web preview (8081/19006), + same-origin.
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:4000",
      "http://localhost:8081",
      "http://localhost:19006",
    ],
    credentials: true,
  })
);
// Paystack webhook needs the RAW body for HMAC signature verification —
// mount the raw parser on this path BEFORE the global JSON parser.
app.use("/api/webhooks/paystack", express.raw({ type: "*/*" }));
app.use(express.json());

// Health + config
app.use("/api/health", healthRouter);

// Routers
app.use("/api/auth", authRouter);
app.use("/api/search", searchRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/timesheets", timesheetsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/workers", workersRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/candidates", candidatesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);

// v3 — worker-facing (mobile app)
app.use("/api/me", meRouter);
app.use("/api/me/kyc/documents", kycDocumentsRouter);
app.use("/api/clock", clockRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/disputes", adminDisputesRouter);
app.use("/api/me/disputes", disputesRouter);
app.use("/api/workers", ratingsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/admin/funding", fundingRouter);

// Serve uploaded KYC documents (dev only; use signed S3 URLs in prod).
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler — always returns { error } shape.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Afrizone server listening on http://localhost:${PORT}`);
});

export default app;
