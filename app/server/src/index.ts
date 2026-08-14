import { httpServerHandler } from "cloudflare:node";
import express, { NextFunction, Request as ExpressRequest, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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
import kycDocumentsRouter, { handleKycUpload, handleKycFileGet } from "./routes/kycDocuments";
import searchRouter from "./routes/search";
import healthRouter from "./routes/health";
import fundingRouter from "./routes/funding";

const app = express();

app.set("trust proxy", 1);
// crossOriginResourcePolicy relaxed to "cross-origin": this API is deliberately
// consumed from other origins (web-admin, mobile web preview), including the
// authenticated KYC file route, which admin web loads directly in <img> tags.
// helmet's default "same-origin" policy would silently block those image loads.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS: Vite admin dev server, Expo web preview (8081/19006), + same-origin.
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4000,http://localhost:8081,http://localhost:19006")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);
// Paystack webhook needs the RAW body for HMAC signature verification:
// mount the raw parser on this path BEFORE the global JSON parser.
app.use("/api/webhooks/paystack", express.raw({ type: "*/*" }));
app.use(express.json());

// Rate limiting is disabled under the automated test suite (NODE_ENV=test):
// tests legitimately fire many requests at /api/auth in a short window, and
// the limiter's own behaviour is covered separately, not via the app tests.
//
// NOTE: express-rate-limit's default in-memory store is per-isolate. Workers
// can run many concurrent isolates, so this is a best-effort per-isolate
// backstop against abuse/scraping now, not a strict global rate limit the
// way it was on a single long-lived Railway process. Accepted trade-off for
// this migration; moving to Cloudflare's native rate-limiting rules or a
// Durable-Object-backed counter is a real follow-up, not done here.
//
// The limiters are also constructed lazily, not at module scope: MemoryStore
// calls setInterval() the moment rateLimit() runs, and Workers hard-forbid
// timers (and any async I/O or randomness) outside of a request handler -
// "Disallowed operation called within global scope." Deferring construction
// to the first real request keeps that setInterval call inside a valid
// request context instead of module-evaluation time.
//
// keyGenerator is also overridden: express-rate-limit's default reads
// req.ip, which httpServerHandler's Node-request adaptation leaves
// undefined (there's no real TCP socket behind a Workers request the way
// there is on a normal Node HTTP server) - throws ERR_ERL_UNDEFINED_IP_ADDRESS
// otherwise. Cloudflare's edge always sets CF-Connecting-IP on real traffic;
// falling back to a constant key in local dev (where that header is absent)
// just means dev testing shares one bucket, which is fine.
const rateLimitKey = (req: ExpressRequest) =>
  req.headers["cf-connecting-ip"]?.toString() || "local-dev";

if (process.env.NODE_ENV !== "test") {
  let apiLimiter: ReturnType<typeof rateLimit> | undefined;
  app.use("/api", (req, res, next) => {
    apiLimiter ??= rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: rateLimitKey,
    });
    return apiLimiter(req, res, next);
  });

  let authLimiter: ReturnType<typeof rateLimit> | undefined;
  app.use("/api/auth", (req, res, next) => {
    authLimiter ??= rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many auth requests. Try again later." },
      keyGenerator: rateLimitKey,
    });
    return authLimiter(req, res, next);
  });
}

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

// v3: worker-facing (mobile app)
app.use("/api/me", meRouter);
// GET only here - POST is intercepted before Express, see the fetch handler below.
app.use("/api/me/kyc/documents", kycDocumentsRouter);
app.use("/api/clock", clockRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/disputes", adminDisputesRouter);
app.use("/api/me/disputes", disputesRouter);
app.use("/api/workers", ratingsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/admin/funding", fundingRouter);

// 404
app.use((_req: ExpressRequest, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler, always returns { error } shape.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: ExpressRequest, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

// Kept exported for supertest during the vitest-pool-workers migration window
// (see server/test/README or the migration plan) and for any future in-
// process testing needs; production traffic goes through the fetch handler
// below, not through app.listen().
export { app };

const PORT = 3000;
app.listen(PORT);
const workersHandler = httpServerHandler({ port: PORT });

export default {
  fetch(request, env, ctx) {
    // POST /api/me/kyc/documents bypasses Express/multer entirely: Workers'
    // Request.formData() replaces multer, since multer's multipart parsing
    // depends on Node-stream/busboy internals whose behaviour under
    // httpServerHandler's Node-request adaptation isn't something Cloudflare
    // documents as supported (their own file-upload examples always use
    // request.formData(), never multer). See routes/kycDocuments.ts.
    const url = new URL(request.url);
    if (url.pathname === "/api/me/kyc/documents" && request.method === "POST") {
      return handleKycUpload(request);
    }
    // GET /api/me/kyc/documents/file/:filename also bypasses Express: the R2
    // object's body is a WHATWG ReadableStream, and piping that into
    // Express's `res` (a Node stream under httpServerHandler) hangs instead
    // of erroring, since Node streams don't implement the Web Streams sink
    // interface `ReadableStream.pipeTo()` writes to. See routes/kycDocuments.ts.
    const fileMatch = request.method === "GET" && url.pathname.match(/^\/api\/me\/kyc\/documents\/file\/([^/]+)$/);
    if (fileMatch) {
      return handleKycFileGet(request, decodeURIComponent(fileMatch[1]));
    }
    return workersHandler.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
