import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import { tiersToArray, tiersToString, Tier } from "../types";
import { isSmileConfigured, submitDocumentVerification, NgIdType, NG_ID_TYPES } from "../services/smileIdentity";
import { getFileBuffer } from "../services/storage";

const router = Router();

// Derived wallet for the acting worker.
//   pending   = net of payments earned but not yet released (PENDING/APPROVED)
//   withdrawn = sum of non-failed withdrawals (in-flight PROCESSING + settled PAID)
//   available = released earnings minus what's already been withdrawn
// FAILED withdrawals are excluded so they don't reduce the balance.
function walletFrom(
  payments: { net: number; status: string }[],
  withdrawals: { amount: number; status: string }[]
) {
  const pending = payments
    .filter((p) => p.status === "PENDING" || p.status === "APPROVED")
    .reduce((s, p) => s + p.net, 0);
  const released = payments.filter((p) => p.status === "RELEASED").reduce((s, p) => s + p.net, 0);
  const withdrawn = withdrawals
    .filter((w) => w.status !== "FAILED")
    .reduce((s, w) => s + w.amount, 0);
  const available = released - withdrawn;
  return { pending, available, withdrawn };
}

// Shared response shape for all /api/me endpoints that return the worker profile.
function formatUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    tiers: tiersToArray(user.tiers),
    kycStatus: user.kycStatus,
    kycNote: user.kycNote ?? null,
    location: user.location,
    bankMasked: user.bankMasked,
    bankCode: user.bankCode ?? null,
    bankName: user.bankName ?? null,
    tin: user.tin ?? null,
    rating: user.rating,
    completedCount: user.completedCount,
    totpEnabled: user.totpEnabled,
    notifTasks: user.notifTasks,
    notifPay: user.notifPay,
    notifEmail: user.notifEmail,
  };
}

// GET /api/me → the authed worker profile.
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(formatUser(user));
});

// PATCH /api/me → update profile fields: name, email, tin, bank details.
// Used after phone-OTP/Google signup and for profile edits in the mobile app.
router.patch("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { name, email, tin, bankCode, bankAccountNumber, bankName, notifTasks, notifPay, notifEmail } = req.body || {};
  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    const n = String(name).trim();
    if (n.length < 2) return res.status(400).json({ error: "Please enter your full name" });
    data.name = n;
  }
  if (email !== undefined) {
    const e = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    const clash = await prisma.user.findUnique({ where: { email: e } });
    if (clash && clash.id !== req.user!.id) {
      return res.status(409).json({ error: "That email is already in use" });
    }
    data.email = e;
  }
  if (tin !== undefined) {
    const t = String(tin).trim();
    if (t.length > 0 && t.length < 8) {
      return res.status(400).json({ error: "TIN must be at least 8 characters" });
    }
    data.tin = t || null;
  }
  if (bankCode !== undefined) data.bankCode = String(bankCode).trim() || null;
  if (bankName !== undefined) data.bankName = String(bankName).trim() || null;
  if (bankAccountNumber !== undefined) {
    const acct = String(bankAccountNumber).replace(/\D/g, "");
    if (acct && acct.length !== 10) {
      return res.status(400).json({ error: "Account number must be exactly 10 digits" });
    }
    data.bankAccountNumber = acct || null;
    // Recompute masked form: "BankName ••XX"
    if (acct && (bankName || data.bankName)) {
      const bName = String(bankName ?? data.bankName ?? "");
      data.bankMasked = `${bName} ••${acct.slice(-2)}`;
    }
  }

  if (notifTasks !== undefined) data.notifTasks = Boolean(notifTasks);
  if (notifPay !== undefined) data.notifPay = Boolean(notifPay);
  if (notifEmail !== undefined) data.notifEmail = Boolean(notifEmail);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json(formatUser(user));
});

// GET /api/me/applications → worker's applications joined with task summary + paymentId.
router.get("/applications", requireAuth, async (req: AuthedRequest, res: Response) => {
  const [apps, payments] = await Promise.all([
    prisma.application.findMany({
      where: { workerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: { task: true },
    }),
    prisma.payment.findMany({
      where: { workerId: req.user!.id },
      select: { id: true, taskId: true },
    }),
  ]);
  const paymentByTask = Object.fromEntries(payments.map((p) => [p.taskId, p.id]));
  res.json(
    apps.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      pitch: a.pitch,
      status: a.status,
      reason: a.reason,
      createdAt: a.createdAt,
      paymentId: paymentByTask[a.taskId] ?? null,
      task: {
        id: a.task.id,
        title: a.task.title,
        category: a.task.category,
        tier: a.task.tier,
        payModel: a.task.payModel,
        rate: a.task.rate,
        budget: a.task.budget,
        status: a.task.status,
        address: a.task.address,
        locationType: a.task.locationType,
        startDate: a.task.startDate,
        endDate: a.task.endDate,
      },
    }))
  );
});

// GET /api/me/wallet → {pending, available, withdrawn}.
router.get("/wallet", requireAuth, async (req: AuthedRequest, res: Response) => {
  const [payments, withdrawals] = await Promise.all([
    prisma.payment.findMany({ where: { workerId: req.user!.id } }),
    prisma.withdrawal.findMany({ where: { workerId: req.user!.id } }),
  ]);
  res.json(walletFrom(payments, withdrawals));
});

// GET /api/me/transactions → merged earnings + withdrawals, newest-first.
router.get("/transactions", requireAuth, async (req: AuthedRequest, res: Response) => {
  const [payments, withdrawals] = await Promise.all([
    prisma.payment.findMany({
      where: { workerId: req.user!.id },
      include: { task: true },
    }),
    prisma.withdrawal.findMany({ where: { workerId: req.user!.id } }),
  ]);
  const earnings = payments.map((p) => ({
    id: p.id,
    kind: "earning" as const,
    title: p.task.title,
    amount: p.net,
    status: p.status,
    createdAt: p.createdAt,
  }));
  const wds = withdrawals.map((w) => ({
    id: w.id,
    kind: "withdrawal" as const,
    title: `Withdrawal to ${w.bankMasked}`,
    amount: w.amount,
    status: w.status,
    createdAt: w.createdAt,
  }));
  const merged = [...earnings, ...wds].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(merged);
});

// GET /api/me/clock/:taskId → resume state for the active-task screen.
router.get("/clock/:taskId", requireAuth, async (req: AuthedRequest, res: Response) => {
  const last = await prisma.clockEvent.findFirst({
    where: { workerId: req.user!.id, taskId: req.params.taskId },
    orderBy: { createdAt: "desc" },
  });
  if (!last) {
    return res.json({ clockedIn: false, lastEventAt: null, elapsedSeconds: 0 });
  }
  const clockedIn = last.type === "IN";
  const elapsedSeconds = clockedIn
    ? Math.max(0, Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 1000))
    : 0;
  res.json({ clockedIn, lastEventAt: last.createdAt, elapsedSeconds });
});

// GET /api/me/payments/:id → full payment detail for the authenticated worker.
router.get("/payments/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
    include: { task: true },
  });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  if (payment.workerId !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

  res.json({
    id: payment.id,
    gross: payment.gross,
    whtRate: payment.whtRate,
    whtAmount: payment.whtAmount,
    net: payment.net,
    status: payment.status,
    createdAt: payment.createdAt,
    task: { id: payment.task.id, title: payment.task.title },
  });
});

// GET /api/me/timesheets → worker's own timesheet history, newest-first.
router.get("/timesheets", requireAuth, async (req: AuthedRequest, res: Response) => {
  const timesheets = await prisma.timesheet.findMany({
    where: { workerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { task: true },
  });
  res.json(
    timesheets.map((ts) => ({
      id: ts.id,
      taskId: ts.taskId,
      periodStart: ts.periodStart,
      periodEnd: ts.periodEnd,
      hours: ts.hours,
      status: ts.status,
      createdAt: ts.createdAt,
      task: { id: ts.task.id, title: ts.task.title },
    }))
  );
});

// GET /api/me/ratings → worker's individual ratings, newest-first.
router.get("/ratings", requireAuth, async (req: AuthedRequest, res: Response) => {
  const ratings = await prisma.rating.findMany({
    where: { workerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { task: true },
  });
  res.json(
    ratings.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      score: r.score,
      note: r.note,
      createdAt: r.createdAt,
      task: { id: r.task.id, title: r.task.title },
    }))
  );
});

// GET /api/me/contracts → worker's contracts joined with task summary.
router.get("/contracts", requireAuth, async (req: AuthedRequest, res: Response) => {
  const contracts = await prisma.contract.findMany({
    where: { workerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { task: true },
  });
  res.json(
    contracts.map((c) => ({
      id: c.id,
      status: c.status,
      signedAt: c.signedAt,
      task: { id: c.task.id, title: c.task.title },
    }))
  );
});

// Builds the rendered contract section array from task + worker data.
function buildContractSections(
  task: any,
  worker: any,
  signedAt: Date | null,
  signerName?: string | null
): { heading: string; body: string }[] {
  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "TBD";
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

  const pay =
    task.payModel === "HOURLY"
      ? `${fmtMoney(task.rate ?? 0)} per hour`
      : `${fmtMoney(task.budget ?? 0)} fixed price`;

  const location =
    task.locationType === "REMOTE"
      ? "Remote — no fixed site required"
      : task.address
      ? `Physical site: ${task.address}`
      : "Physical site (address to be confirmed)";

  const workerName = worker.name ?? "The Contractor";
  const workerContact = worker.email ?? worker.phone ?? "on file";

  return [
    {
      heading: "1. Parties",
      body: `This Independent Contractor Service Agreement ("Agreement") is entered into between:\n\n• Afrizone Part Time ("Afrizone", "the Platform"), acting as the service marketplace; and\n• ${workerName} ("Contractor"), contact: ${workerContact}.\n\nThis Agreement governs the Contractor's engagement on the task described below.`,
    },
    {
      heading: "2. Scope of Work",
      body: `Task: ${task.title}\nCategory: ${task.category}\nTier: ${task.tier}\n\n${task.description ?? "The Contractor shall perform all duties assigned under this task to the standard required by Afrizone and the task requester."}`,
    },
    {
      heading: "3. Location",
      body: location,
    },
    {
      heading: "4. Schedule",
      body: `Start date: ${fmt(task.startDate)}\nEnd date:   ${fmt(task.endDate)}\n\nThe Contractor must clock in and clock out via the Afrizone mobile app at the start and end of each shift. Failure to record attendance may affect payment.`,
    },
    {
      heading: "5. Compensation",
      body: `Rate: ${pay}\nWithholding Tax (WHT): 5% of gross earnings will be deducted and remitted to the FIRS on the Contractor's behalf. Net earnings are credited to the Contractor's wallet upon timesheet approval.\n\nPayment is released within 3 business days of an approved timesheet.`,
    },
    {
      heading: "6. Independent Contractor Status",
      body: `The Contractor is engaged as an independent contractor and not as an employee of Afrizone or the task requester. The Contractor is responsible for their own professional indemnity, health and safety compliance, and any taxes beyond WHT already remitted by Afrizone. No employment benefits, pension contributions, or leave entitlements arise under this Agreement.`,
    },
    {
      heading: "7. Contractor Obligations",
      body: `The Contractor agrees to:\n• Arrive punctually and complete all scheduled shifts.\n• Clock in/out accurately via the Afrizone app for each shift.\n• Submit a timesheet at the end of the engagement period.\n• Maintain professional conduct and comply with the task requester's site rules.\n• Notify Afrizone Support at least 24 hours in advance if unable to attend a shift.`,
    },
    {
      heading: "8. Termination",
      body: `Either party may terminate this Agreement with 24 hours' written notice. Afrizone may terminate immediately for gross misconduct, fraudulent clock events, or material breach of this Agreement. Earnings accrued for completed, approved shifts will be paid regardless of early termination.`,
    },
    {
      heading: "9. Confidentiality",
      body: `The Contractor shall not disclose any confidential information belonging to Afrizone, the task requester, or their customers that is encountered during the engagement. This obligation survives termination of this Agreement.`,
    },
    {
      heading: "10. Governing Law",
      body: `This Agreement is governed by the laws of the Federal Republic of Nigeria. Any dispute shall first be subject to good-faith negotiation; failing resolution, the parties submit to the jurisdiction of the courts of Lagos State.`,
    },
    {
      heading: "11. Entire Agreement",
      body: `This Agreement constitutes the entire agreement between the parties regarding the task and supersedes all prior discussions. It may only be amended in writing signed by both parties.\n\n${signedAt ? `Digitally signed by ${signerName || workerName} on ${fmt(signedAt)}.` : "This Agreement takes effect upon the Contractor's typed-name digital signature via the Afrizone app."}`,
    },
  ];
}

// GET /api/me/contracts/:id → full contract detail with generated sections.
router.get("/contracts/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const contract = await prisma.contract.findUnique({
    where: { id: req.params.id },
    include: { task: true, worker: true },
  });
  if (!contract) return res.status(404).json({ error: "Contract not found" });
  if (contract.workerId !== req.user!.id) {
    return res.status(403).json({ error: "Not your contract" });
  }

  const sections = buildContractSections(contract.task, contract.worker, contract.signedAt, contract.signerName);
  res.json({
    id: contract.id,
    status: contract.status,
    signedAt: contract.signedAt,
    signerName: contract.signerName,
    createdAt: contract.createdAt,
    task: {
      id: contract.task.id,
      title: contract.task.title,
      category: contract.task.category,
      tier: contract.task.tier,
    },
    sections,
  });
});

// PATCH /api/me/push-token → body {pushToken}. Upserts the Expo push token for this worker.
router.patch("/push-token", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { pushToken } = req.body || {};
  if (!pushToken || typeof pushToken !== "string") {
    return res.status(400).json({ error: "pushToken is required" });
  }
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { pushToken },
  });
  res.json({ ok: true });
});

// POST /api/me/kyc/submit → body {tin?, bankMasked?, bankCode?, bankAccountNumber?, bankName?, tier?, idType?}.
// When Smile ID is configured (see services/smileIdentity.ts) and the worker has
// uploaded both an ID and a selfie document, this also runs an automated Document
// Verification pass: a final REJECTED result short-circuits straight to kycStatus
// REJECTED (with the real reason in kycNote), a final approval moves to kycStatus
// VERIFIED — still awaiting an admin's own TIER_APPROVED call. Any failure to reach
// Smile (missing docs, no idType, network error) falls back to the pre-existing
// manual-review flow (kycStatus stays PENDING for an admin to decide).
router.post("/kyc/submit", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { tin, bankMasked, bankCode, bankAccountNumber, bankName, tier, idType } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  let tiers = tiersToArray(user.tiers);
  if (tier && !tiers.includes(tier as Tier)) {
    tiers = [...tiers, tier as Tier];
  }

  let kycStatus = "PENDING";
  let kycNote: string | null = null;

  if (isSmileConfigured && NG_ID_TYPES.includes(idType)) {
    const docs = await prisma.kycDocument.findMany({
      where: { userId: user.id, docType: { in: ["ID", "SELFIE"] } },
      orderBy: { createdAt: "desc" },
    });
    const idDoc = docs.find((d) => d.docType === "ID");
    const selfieDoc = docs.find((d) => d.docType === "SELFIE");

    if (idDoc && selfieDoc) {
      const jobId = `kyc_${user.id}_${Date.now()}`;
      try {
        const [idBuf, selfieBuf] = await Promise.all([
          getFileBuffer(idDoc.filename),
          getFileBuffer(selfieDoc.filename),
        ]);
        const result = await submitDocumentVerification({
          jobId,
          userId: user.id,
          idType: idType as NgIdType,
          idFrontBase64: idBuf.toString("base64"),
          selfieBase64: selfieBuf.toString("base64"),
        });

        await prisma.kycVerification.create({
          data: {
            workerId: user.id,
            jobId,
            smileJobId: result.smileJobId,
            status: result.final ? (result.approved ? "APPROVED" : "REJECTED") : "PENDING",
            resultCode: result.resultCode,
            resultText: result.resultText,
            raw: JSON.stringify(result.raw),
          },
        });

        if (result.final) {
          kycStatus = result.approved ? "VERIFIED" : "REJECTED";
          kycNote = result.approved
            ? null
            : result.resultText ||
              "Automated verification did not pass. Please re-check your documents and try again.";
        }
      } catch (err) {
        console.error("[smileIdentity] verification failed, falling back to manual review:", err);
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      tin: tin != null ? String(tin) : user.tin,
      bankMasked: bankMasked != null ? String(bankMasked) : user.bankMasked,
      bankCode: bankCode != null ? String(bankCode) : user.bankCode,
      bankAccountNumber: bankAccountNumber != null ? String(bankAccountNumber) : user.bankAccountNumber,
      bankName: bankName != null ? String(bankName) : user.bankName,
      tiers: tiersToString(tiers),
      kycStatus,
      kycNote,
    },
  });
  res.json(formatUser(updated));
});

// GET /api/me/tax-statement?year=YYYY → CSV of released WHT payments for that year.
router.get("/tax-statement", requireAuth, async (req: AuthedRequest, res: Response) => {
  const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10);
  if (isNaN(year) || year < 2020 || year > 2099) {
    return res.status(400).json({ error: "Invalid year" });
  }
  const from = new Date(`${year}-01-01T00:00:00.000Z`);
  const to = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const [user, payments] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id } }),
    prisma.payment.findMany({
      where: { workerId: req.user!.id, status: "RELEASED", createdAt: { gte: from, lt: to } },
      include: { task: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!user) return res.status(404).json({ error: "User not found" });

  const totalGross = payments.reduce((s, p) => s + p.gross, 0);
  const totalWht = payments.reduce((s, p) => s + p.whtAmount, 0);
  const totalNet = payments.reduce((s, p) => s + p.net, 0);

  const rows = [
    "Afrizone Part Time - Annual WHT Statement",
    `Worker:,${user.name ?? "-"}`,
    `Email/Phone:,${user.email ?? user.phone ?? "-"}`,
    `TIN:,${user.tin ?? "Not provided"}`,
    `Year:,${year}`,
    "",
    "Date,Task,Gross (NGN),WHT 5% (NGN),Net (NGN)",
    ...payments.map((p) =>
      [
        new Date(p.createdAt).toISOString().slice(0, 10),
        `"${p.task.title.replace(/"/g, '""')}"`,
        p.gross,
        p.whtAmount,
        p.net,
      ].join(",")
    ),
    "",
    `TOTAL,,${totalGross},${totalWht},${totalNet}`,
  ];

  const safeName = (user.name ?? "statement")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `afrizone-wht-${year}-${safeName}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(rows.join("\r\n"));
});

export default router;
