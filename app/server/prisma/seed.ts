import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeWht } from "../src/util/tax";

const prisma = new PrismaClient();

// Tables in delete-safe order (children before parents) - same order as the
// deleteMany() calls below. Insert order (built from this, reversed) is
// parents before children, so FK references always exist by insert time.
const TABLES_CHILD_TO_PARENT = [
  "AuditLog",
  // Task requirements, before Task and before the two catalogues they point at.
  "TaskSkillRequirement",
  "TaskCredentialRequirement",
  // Talent profile. Credential references User, CredentialType AND KycDocument,
  // so it has to be cleared before all three.
  "Credential",
  "WorkerSkill",
  // Notification references User. It was added with the inbox and belongs here
  // for the same reason as everything else in this list: without it, a re-seed
  // leaves the previous run's rows behind, which is exactly the kind of
  // leftover that makes a "clean" database behave unaccountably.
  "Notification",
  "ClockEvent",
  "Withdrawal",
  "Contract",
  "Dispute",
  "KycVerification",
  "KycDocument",
  "Rating",
  "Payment",
  "Funding",
  "Timesheet",
  "Application",
  "Task",
  // OrganizationMember references BOTH Organization and User, so it clears
  // before either. Organization itself has no FK out, but must still precede
  // User here only because this list doubles as the dump order in reverse -
  // Organization rows have to be restored before the memberships pointing at
  // them.
  "OrganizationMember",
  "Organization",
  "PasswordReset",
  "OtpCode",
  "User",
  "JobApplication",
  "Job",
  // Parents of the two talent-profile tables above, so they come after them.
  "Skill",
  "CredentialType",
  "TaxRate",
  "Category",
  "Setting",
];

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Dumps prisma/dev.db's freshly-seeded rows to SQL and applies them to
 * wrangler dev's local D1 emulation (a real SQLite file, but its exact path
 * is an undocumented Miniflare internal - going through `wrangler d1 execute`
 * instead keeps this on the officially supported interface). The D1 schema
 * itself is untouched here: it's expected to already exist via
 * `wrangler d1 migrations apply afrizone-db --local`.
 */
async function seedLocalD1() {
  const serverRoot = path.join(__dirname, "..");
  const lines: string[] = ["PRAGMA foreign_keys=OFF;"];
  for (const table of TABLES_CHILD_TO_PARENT) {
    lines.push(`DELETE FROM "${table}";`);
  }
  for (const table of [...TABLES_CHILD_TO_PARENT].reverse()) {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}"`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => sqlLiteral(row[c]));
      lines.push(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${vals.join(",")});`);
    }
  }

  const dumpPath = path.join(serverRoot, "prisma", ".seed-dump.sql");
  fs.writeFileSync(dumpPath, lines.join("\n"));
  try {
    // execSync (not execFileSync): dumpPath is the only interpolated value
    // here and it's derived from __dirname, not user input.
    execSync(`npx wrangler d1 execute afrizone-db --local --file="${dumpPath}"`, {
      cwd: serverRoot,
      stdio: "inherit",
    });
  } finally {
    fs.unlinkSync(dumpPath);
  }
}

// Default worker password (all demo workers share it).
const WORKER_PW = "worker123";

async function main() {
  console.log("Seeding Afrizone database...");

  // Clear existing data (idempotent re-seed). Order respects FKs.
  await prisma.auditLog.deleteMany();
  // v3 tables (delete before payments/tasks/users they reference)
  await prisma.clockEvent.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.kycVerification.deleteMany();
  await prisma.kycDocument.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.funding.deleteMany();
  await prisma.timesheet.deleteMany();
  await prisma.application.deleteMany();
  // Task requirements FK Task, Skill AND CredentialType, all with RESTRICT, so
  // they clear before any of the three.
  //
  // These used to sit further down, after task.deleteMany(). That was latent
  // until the seed began gating a task on a licence and a skill: with no
  // requirement rows the ordering never mattered, and the first re-seed after
  // they appeared failed with a foreign-key error on Task. A delete order is
  // only exercised by the SECOND run.
  await prisma.taskSkillRequirement.deleteMany();
  await prisma.taskCredentialRequirement.deleteMany();
  await prisma.task.deleteMany();
  // organizations: OrganizationMember FKs BOTH Organization and User, so it
  // clears before either
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  // auth tables (PasswordReset FKs User; OtpCode is standalone but clear too)
  await prisma.passwordReset.deleteMany();
  await prisma.otpCode.deleteMany();
  // talent profile: both FK User, so they must go first
  await prisma.credential.deleteMany();
  await prisma.workerSkill.deleteMany();
  await prisma.credentialType.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.user.deleteMany();
  // v2 tables
  await prisma.jobApplication.deleteMany();
  await prisma.job.deleteMany();
  await prisma.taxRate.deleteMany();
  await prisma.category.deleteMany();
  await prisma.setting.deleteMany();

  const adminHash = await bcrypt.hash("afrizone123", 10);
  const workerHash = await bcrypt.hash(WORKER_PW, 10);

  // ── Admin ──────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      name: "Afrizone Admin",
      email: "admin@afrizone.work",
      passwordHash: adminHash,
      role: "SUPER_ADMIN",
      tiers: "",
      kycStatus: "VERIFIED",
      location: "Lagos, NG",
    },
  });

  // ── Workers (from contract Seed data) ────────────────────────────────────
  // Amaka Obi (PROMO, VERIFIED, 47, 4.9)
  const amaka = await prisma.user.create({
    data: {
      name: "Amaka Obi",
      email: "amaka.obi@afrizone.work",
      phone: "+2348030000001",
      passwordHash: workerHash,
      role: "WORKER",
      tiers: "PROMO",
      kycStatus: "VERIFIED",
      location: "Ikeja, Lagos",
      rating: 4.9,
      completedCount: 47,
      bankMasked: "****1234",
      bankAccountNumber: "0001234567", // demo NUBAN for Paystack live mode
      bankCode: "058", // GTBank
      bankName: "GTBank",
    },
  });
  // Tunde Bello (DISPATCH, VERIFIED, 89, 4.8)
  const tunde = await prisma.user.create({
    data: {
      name: "Tunde Bello",
      email: "tunde.bello@afrizone.work",
      phone: "+2348030000002",
      passwordHash: workerHash,
      role: "WORKER",
      tiers: "DISPATCH",
      kycStatus: "VERIFIED",
      location: "Yaba, Lagos",
      rating: 4.8,
      completedCount: 89,
      bankMasked: "****5678",
    },
  });
  // Ngozi Eze (REMOTE, PENDING, 12, 4.7)
  const ngozi = await prisma.user.create({
    data: {
      name: "Ngozi Eze",
      email: "ngozi.eze@afrizone.work",
      phone: "+2348030000003",
      passwordHash: workerHash,
      role: "WORKER",
      tiers: "REMOTE",
      kycStatus: "PENDING",
      location: "Remote",
      rating: 4.7,
      completedCount: 12,
      bankMasked: "****9012",
    },
  });
  // Ibrahim Kola (DISPATCH, VERIFIED)
  const ibrahim = await prisma.user.create({
    data: {
      name: "Ibrahim Kola",
      email: "ibrahim.kola@afrizone.work",
      phone: "+2348030000004",
      passwordHash: workerHash,
      role: "WORKER",
      tiers: "DISPATCH",
      kycStatus: "VERIFIED",
      location: "Surulere, Lagos",
      rating: 4.6,
      completedCount: 31,
      bankMasked: "****3456",
    },
  });
  // Funke Ade (PROMO)
  const funke = await prisma.user.create({
    data: {
      name: "Funke Ade",
      email: "funke.ade@afrizone.work",
      phone: "+2348030000005",
      passwordHash: workerHash,
      role: "WORKER",
      tiers: "PROMO",
      kycStatus: "TIER_APPROVED",
      location: "Lekki, Lagos",
      rating: 4.5,
      completedCount: 18,
      bankMasked: "****7890",
    },
  });
  // Bayo Adigun (TRADE, VERIFIED), fills the single-slot AC servicing task below.
  const bayo = await prisma.user.create({
    data: {
      name: "Bayo Adigun",
      email: "bayo.adigun@afrizone.work",
      phone: "+2348030000006",
      passwordHash: workerHash,
      role: "WORKER",
      tiers: "TRADE",
      kycStatus: "VERIFIED",
      location: "Lekki, Lagos",
      rating: 4.7,
      completedCount: 22,
      bankMasked: "****2345",
    },
  });

  const day = 24 * 3600 * 1000;
  const hour = 3600 * 1000;
  const now = Date.now();
  const d = (offsetDays: number) => new Date(now + offsetDays * day);
  // Same as d(), plus an hour offset, used to stagger task-posted vs.
  // application-approved timestamps so avg time-to-fill isn't ~0.
  const dh = (offsetDays: number, offsetHours = 0) => new Date(now + offsetDays * day + offsetHours * hour);

  // ── Tasks (from contract Seed data) ───────────────────────────────────────
  const tDispatch = await prisma.task.create({
    data: {
      title: "Same-day parcel runs, Yaba",
      description: "Pick up and deliver same-day parcels around Yaba. Own bike preferred.",
      category: "Dispatch",
      tier: "DISPATCH",
      payModel: "HOURLY",
      rate: 2500,
      startDate: d(1),
      endDate: d(8),
      locationType: "PHYSICAL",
      address: "Yaba, Lagos",
      geofenceRadius: 150,
      slots: 3,
      status: "OPEN",
      deadline: d(2),
      createdById: admin.id,
      createdAt: dh(-2),
    },
  });
  const tPromo = await prisma.task.create({
    data: {
      title: "Weekend mall activation, Ikeja",
      description: "Brand activation at Ikeja City Mall. Promo staff, fixed weekend fee.",
      category: "Promo",
      tier: "PROMO",
      payModel: "FIXED",
      budget: 18000,
      startDate: d(3),
      endDate: d(5),
      locationType: "PHYSICAL",
      address: "Ikeja City Mall, Lagos",
      geofenceRadius: 100,
      slots: 5,
      status: "OPEN",
      deadline: d(2),
      createdById: admin.id,
      createdAt: dh(-3),
    },
  });
  const tRemote = await prisma.task.create({
    data: {
      title: "Product data cleanup, 20h",
      description: "Clean and normalise product catalogue data. Fully remote, ~20 hours.",
      category: "Remote",
      tier: "REMOTE",
      payModel: "HOURLY",
      rate: 1800,
      startDate: d(1),
      endDate: d(10),
      locationType: "REMOTE",
      address: null,
      geofenceRadius: 100,
      slots: 2,
      status: "OPEN",
      deadline: d(3),
      createdById: admin.id,
    },
  });
  const tTrade = await prisma.task.create({
    data: {
      title: "AC servicing, Lekki",
      description: "Service 4 split-unit air conditioners at a Lekki residence. Certified technicians only.",
      category: "Trade",
      tier: "TRADE",
      payModel: "FIXED",
      budget: 45000,
      startDate: d(2),
      endDate: d(2),
      locationType: "PHYSICAL",
      address: "Lekki Phase 1, Lagos",
      geofenceRadius: 80,
      slots: 1,
      status: "FILLED", // single slot, filled by Bayo's approved application below
      deadline: d(1),
      createdById: admin.id,
      createdAt: dh(-1),
    },
  });
  const tCampus = await prisma.task.create({
    data: {
      title: "Campus survey, UNILAG",
      description: "Conduct on-campus consumer surveys at UNILAG. Students welcome.",
      category: "Student",
      tier: "STUDENT",
      payModel: "HOURLY",
      rate: 1200,
      startDate: d(4),
      endDate: d(6),
      locationType: "PHYSICAL",
      address: "University of Lagos, Akoka",
      geofenceRadius: 200,
      slots: 10,
      status: "OPEN",
      deadline: d(3),
      createdById: admin.id,
    },
  });

  // ── Applications ──────────────────────────────────────────────────────────
  // Timestamps are staggered a few hours after each task's createdAt so
  // "avg time to fill" on the dashboard reflects a real gap, not ~0.
  await prisma.application.create({
    data: { taskId: tPromo.id, workerId: amaka.id, pitch: "Done 47 activations, top-rated promo.", status: "APPROVED", createdAt: dh(-3, 8) },
  });
  await prisma.application.create({
    data: { taskId: tDispatch.id, workerId: tunde.id, pitch: "Yaba local, own bike, 89 deliveries.", status: "APPROVED", createdAt: dh(-2, 5) },
  });
  await prisma.application.create({
    // APPROVED (not APPLIED), matches the APPROVED payment he already has for this task below.
    data: { taskId: tDispatch.id, workerId: ibrahim.id, pitch: "Reliable dispatch rider.", status: "APPROVED", createdAt: dh(-2, 20) },
  });
  await prisma.application.create({
    data: { taskId: tRemote.id, workerId: ngozi.id, pitch: "Strong with spreadsheets and data tools.", status: "APPLIED" },
  });
  await prisma.application.create({
    data: { taskId: tPromo.id, workerId: funke.id, pitch: "Available all weekend, promo experience.", status: "APPLIED" },
  });
  await prisma.application.create({
    data: { taskId: tCampus.id, workerId: ngozi.id, pitch: "UNILAG alumna, knows the campus.", status: "APPLIED" },
  });
  await prisma.application.create({
    // Fills tTrade's single slot, matches its status: "FILLED" above.
    data: { taskId: tTrade.id, workerId: bayo.id, pitch: "Certified HVAC technician, 22 completed jobs.", status: "APPROVED", createdAt: dh(-1, 3) },
  });

  // ── Timesheets (a couple submitted, for the approval queue) ───────────────
  await prisma.timesheet.create({
    data: {
      taskId: tDispatch.id,
      workerId: tunde.id,
      periodStart: d(-2),
      periodEnd: d(-1),
      hours: 6,
      status: "SUBMITTED",
      gpsNote: "Clocked in within Yaba geofence.",
    },
  });
  await prisma.timesheet.create({
    data: {
      taskId: tRemote.id,
      workerId: ngozi.id,
      periodStart: d(-3),
      periodEnd: d(-1),
      hours: 10,
      status: "SUBMITTED",
      gpsNote: "Remote, no geofence.",
    },
  });

  // ── Payments (from contract Seed data) ────────────────────────────────────
  // Net = gross − 5% WHT.
  const mkPay = (workerId: string, taskId: string, gross: number, status: string) => {
    const { whtAmount, net } = computeWht(gross, 0.05);
    return prisma.payment.create({
      data: { workerId, taskId, gross, whtRate: 0.05, whtAmount, net, status },
    });
  };
  // Amaka ₦18,000 (RELEASED, she has a withdrawal against it, so the wallet is coherent)
  await mkPay(amaka.id, tPromo.id, 18000, "RELEASED");
  // Tunde ₦12,500 (review/PENDING)
  await mkPay(tunde.id, tDispatch.id, 12500, "PENDING");
  // Ngozi ₦36,000 (APPROVED)
  await mkPay(ngozi.id, tRemote.id, 36000, "APPROVED");
  // Ibrahim ₦9,000 (APPROVED)
  await mkPay(ibrahim.id, tDispatch.id, 9000, "APPROVED");
  // Funke ₦24,000 (DISPUTED)
  const funkePayment = await mkPay(funke.id, tPromo.id, 24000, "DISPUTED");
  await prisma.dispute.create({
    data: {
      workerId: funke.id,
      entityType: "PAYMENT",
      entityId: funkePayment.id,
      reason: "Payment amount looks lower than what was agreed for the weekend shift.",
      status: "OPEN",
    },
  });

  // ── v3: Amaka's worker journey (mobile app demo data) ─────────────────────
  // Amaka already has: APPROVED application on tPromo + ₦18,000 APPROVED Payment.
  // An assigned but not-yet-started contract for the approved mall activation.
  await prisma.contract.create({
    data: { taskId: tPromo.id, workerId: amaka.id, status: "CLAIMED" },
  });
  // A second PROMO task so Amaka has a tier-matching "Applied" item.
  const tPromo2 = await prisma.task.create({
    data: {
      title: "Brand sampling, Lekki Mall",
      description: "In-store product sampling and customer engagement over a long weekend.",
      category: "Promo",
      tier: "PROMO",
      payModel: "FIXED",
      budget: 22000,
      startDate: d(6),
      endDate: d(8),
      locationType: "PHYSICAL",
      address: "Lekki Mall, Lagos",
      geofenceRadius: 100,
      slots: 4,
      status: "OPEN",
      deadline: d(4),
      createdById: admin.id,
    },
  });
  // An APPLIED application on the second promo task (matches her PROMO tier).
  await prisma.application.create({
    data: { taskId: tPromo2.id, workerId: amaka.id, pitch: "Promo pro, available all weekend.", status: "APPLIED" },
  });
  // One IN ClockEvent within fence on her active (physical) task.
  await prisma.clockEvent.create({
    data: {
      workerId: amaka.id,
      taskId: tPromo.id,
      type: "IN",
      lat: 6.6018,
      lng: 3.3515,
      withinFence: true,
      note: "Clocked in at Ikeja City Mall.",
    },
  });
  // One SUBMITTED timesheet for the active task.
  await prisma.timesheet.create({
    data: {
      taskId: tPromo.id,
      workerId: amaka.id,
      periodStart: d(-1),
      periodEnd: d(0),
      hours: 8,
      status: "SUBMITTED",
      gpsNote: "On-site mall activation shift.",
    },
  });
  // One example Withdrawal (₦10,000, PROCESSING).
  await prisma.withdrawal.create({
    data: {
      workerId: amaka.id,
      amount: 10000,
      bankMasked: amaka.bankMasked ?? "****1234",
      status: "PROCESSING",
      provider: "simulated",
      reference: "afz_wd_seed_amaka_1",
    },
  });

  // ── v2: Hiring and Jobs ─────────────────────────────────────────────────────
  const jobOps = await prisma.job.create({
    data: {
      title: "Operations Associate",
      department: "Logistics",
      location: "Lagos, NG",
      employmentType: "FULL_TIME",
      salaryMin: 250000,
      salaryMax: 400000,
      description: "Coordinate daily dispatch operations and rider logistics.",
      needsCv: true,
      needsCover: false,
      needsPortfolio: false,
      closingDate: d(21),
      status: "OPEN",
      createdById: admin.id,
    },
  });
  const jobMkt = await prisma.job.create({
    data: {
      title: "Field Marketing Lead",
      department: "Marketing",
      location: "Lagos, NG",
      employmentType: "FULL_TIME",
      salaryMin: 350000,
      salaryMax: 500000,
      description: "Lead promo activations and field marketing campaigns.",
      needsCv: true,
      needsCover: true,
      needsPortfolio: true,
      closingDate: d(28),
      status: "OPEN",
      createdById: admin.id,
    },
  });
  const jobSupport = await prisma.job.create({
    data: {
      title: "Customer Support (Remote)",
      department: "Support",
      location: "Remote",
      employmentType: "PART_TIME",
      salaryMin: 120000,
      salaryMax: 180000,
      description: "Handle worker and client support tickets remotely.",
      needsCv: true,
      needsCover: false,
      needsPortfolio: false,
      closingDate: d(14),
      status: "OPEN",
      createdById: admin.id,
    },
  });

  // ── v2: Candidates (spread across stages) ──────────────────────────────────
  const candidates: Array<{ jobId: string; name: string; email: string; phone?: string; stage: string; cvNote?: string; rating?: number }> = [
    { jobId: jobOps.id, name: "Chidi Okafor", email: "chidi.okafor@example.com", phone: "+2348030000001", stage: "SCREENING", cvNote: "5y logistics ops." },
    { jobId: jobOps.id, name: "Bukola Adeyemi", email: "bukola.adeyemi@example.com", phone: "+2348030000002", stage: "INTERVIEW", cvNote: "Dispatch coordinator.", rating: 4.2 },
    { jobId: jobOps.id, name: "Emeka Nwosu", email: "emeka.nwosu@example.com", phone: "+2348030000003", stage: "OFFER", cvNote: "Strong ops background.", rating: 4.6 },
    { jobId: jobMkt.id, name: "Aisha Bello", email: "aisha.bello@example.com", phone: "+2348030000004", stage: "SCREENING", cvNote: "Promo team lead." },
    { jobId: jobMkt.id, name: "Tobi Adewale", email: "tobi.adewale@example.com", phone: "+2348030000005", stage: "INTERVIEW", cvNote: "Field campaigns.", rating: 4.4 },
    { jobId: jobMkt.id, name: "Zainab Yusuf", email: "zainab.yusuf@example.com", phone: "+2348030000006", stage: "HIRED", cvNote: "Top candidate, accepted.", rating: 4.9 },
    { jobId: jobSupport.id, name: "Femi Olawale", email: "femi.olawale@example.com", phone: "+2348030000007", stage: "SCREENING", cvNote: "Remote support exp." },
    { jobId: jobSupport.id, name: "Grace Eze", email: "grace.eze@example.com", phone: "+2348030000008", stage: "REJECTED", cvNote: "Not enough experience.", rating: 3.1 },
  ];
  for (const c of candidates) {
    await prisma.jobApplication.create({
      data: {
        jobId: c.jobId,
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        stage: c.stage,
        cvNote: c.cvNote ?? null,
        rating: c.rating ?? null,
      },
    });
  }

  // ── v2: Settings, tax rates ───────────────────────────────────────────────
  await prisma.taxRate.create({
    data: { jurisdiction: "Federal", category: "Services", whtRate: 0.05, vatRate: 0.075, active: true },
  });
  await prisma.taxRate.create({
    data: { jurisdiction: "Lagos", category: "default", whtRate: 0.05, vatRate: 0, active: true },
  });

  // ── v2: Settings, categories ──────────────────────────────────────────────
  const cats: Array<{ name: string; tier: string; defaultPayModel: string }> = [
    { name: "Dispatch", tier: "DISPATCH", defaultPayModel: "HOURLY" },
    { name: "Promo", tier: "PROMO", defaultPayModel: "FIXED" },
    { name: "Remote", tier: "REMOTE", defaultPayModel: "HOURLY" },
    { name: "Trade", tier: "TRADE", defaultPayModel: "FIXED" },
    { name: "Student", tier: "STUDENT", defaultPayModel: "HOURLY" },
  ];
  for (const cat of cats) {
    await prisma.category.create({ data: { ...cat, active: true } });
  }

  // ── Talent profile: skills + credential types ─────────────────────
  //
  // A starter catalogue, so the pickers and the review desk are not empty on
  // first run. Afrizone edits this from Settings; nothing here is load-bearing.
  //
  // Note what is a SKILL and what is a CREDENTIAL. Skills are self-declared and
  // gate nothing. Anything that must actually be guaranteed - a licence, a
  // certification, proof of enrolment - is a credential type, because only
  // those are checked by a person. See schema.prisma.
  const skills: Array<{ name: string; slug: string; group: string; sortOrder: number }> = [
    { name: "Motorcycle riding", slug: "motorcycle-riding", group: "Logistics", sortOrder: 1 },
    { name: "Route planning", slug: "route-planning", group: "Logistics", sortOrder: 2 },
    { name: "Parcel handling", slug: "parcel-handling", group: "Logistics", sortOrder: 3 },
    { name: "Customer service", slug: "customer-service", group: "Retail", sortOrder: 1 },
    { name: "Product sampling", slug: "product-sampling", group: "Retail", sortOrder: 2 },
    { name: "Merchandising", slug: "merchandising", group: "Retail", sortOrder: 3 },
    { name: "Cash handling", slug: "cash-handling", group: "Retail", sortOrder: 4 },
    { name: "Data entry", slug: "data-entry", group: "Office", sortOrder: 1 },
    { name: "Survey administration", slug: "survey-administration", group: "Office", sortOrder: 2 },
    { name: "Social media", slug: "social-media", group: "Office", sortOrder: 3 },
    { name: "Photography", slug: "photography", group: "Creative", sortOrder: 1 },
    { name: "Event setup", slug: "event-setup", group: "Creative", sortOrder: 2 },
    { name: "Electrical work", slug: "electrical-work", group: "Trade", sortOrder: 1 },
    { name: "Plumbing", slug: "plumbing", group: "Trade", sortOrder: 2 },
    { name: "Carpentry", slug: "carpentry", group: "Trade", sortOrder: 3 },
  ];
  for (const sk of skills) {
    await prisma.skill.create({ data: { ...sk, active: true } });
  }

  // ── Demo organizations: one store, one courier company ───────────────────
  //
  // Two members on the store on purpose, an OWNER and a STAFF. One member would
  // demo just as well and would prove nothing: the reason Organization exists as
  // its own table rather than as a User row is precisely that a business has
  // several people and one bank account, and a single-member fixture is
  // indistinguishable from the shape it replaces.
  //
  // The courier company exists for the same reason at the other end - it is the
  // only thing that demonstrates `kind` actually separates two businesses rather
  // than being a column nobody reads.
  //
  // Both ACTIVE so they are usable straight after a seed. Real ones default
  // PENDING and are approved by Afrizone.
  const demoStore = await prisma.organization.create({
    data: {
      kind: "STORE",
      name: "Ikeja City Mart",
      slug: "ikeja-city-mart",
      phone: "+2348030000101",
      email: "ikeja@afrizonemart.com",
      address: "Ikeja City Mall, Alausa, Lagos",
      lat: 6.6018,
      lng: 3.3515,
      // On the STORE, not on either member. This is the whole point.
      bankAccountNumber: "0123456789",
      bankCode: "058",
      bankName: "GTBank",
      bankMasked: "****6789",
      status: "ACTIVE",
    },
  });
  const storeOwner = await prisma.user.create({
    data: {
      name: "Chidi Nwosu",
      email: "chidi.nwosu@afrizonemart.com",
      passwordHash: workerHash,
      role: "WORKER",
      accountType: "STORE",
      tiers: "",
      kycStatus: "VERIFIED",
      location: "Lagos, NG",
    },
  });
  const storeStaff = await prisma.user.create({
    data: {
      name: "Blessing Adeyemi",
      email: "blessing.adeyemi@afrizonemart.com",
      passwordHash: workerHash,
      role: "WORKER",
      accountType: "STORE",
      tiers: "",
      kycStatus: "VERIFIED",
      location: "Lagos, NG",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: demoStore.id, userId: storeOwner.id, role: "OWNER" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: demoStore.id, userId: storeStaff.id, role: "STAFF" },
  });

  const demoCourierCo = await prisma.organization.create({
    data: {
      kind: "COURIER",
      name: "Lagos Swift Riders",
      slug: "lagos-swift-riders",
      phone: "+2348030000102",
      email: "dispatch@lagosswift.ng",
      address: "12 Allen Avenue, Ikeja, Lagos",
      lat: 6.6018,
      lng: 3.3421,
      bankAccountNumber: "9876543210",
      bankCode: "058",
      bankName: "GTBank",
      bankMasked: "****3210",
      status: "ACTIVE",
    },
  });
  const courierOwner = await prisma.user.create({
    data: {
      name: "Emeka Okafor",
      email: "emeka.okafor@lagosswift.ng",
      passwordHash: workerHash,
      role: "WORKER",
      accountType: "COURIER",
      tiers: "DISPATCH",
      kycStatus: "VERIFIED",
      location: "Lagos, NG",
    },
  });
  // A rider employed by the company. Note they are a member of an org AND carry
  // accountType COURIER - the two are independent, and an individual courier
  // with no company looks exactly the same minus the membership row. Every
  // courier flow has to work for both.
  const courierRider = await prisma.user.create({
    data: {
      name: "Yusuf Bello",
      email: "yusuf.bello@lagosswift.ng",
      passwordHash: workerHash,
      role: "WORKER",
      accountType: "COURIER",
      tiers: "DISPATCH",
      kycStatus: "VERIFIED",
      location: "Lagos, NG",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: demoCourierCo.id, userId: courierOwner.id, role: "OWNER" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: demoCourierCo.id, userId: courierRider.id, role: "STAFF" },
  });

  const credentialTypes: Array<{
    name: string;
    slug: string;
    reviewMode: string;
    issuerMode: string;
    requiresExpiry: boolean;
    requiresReference: boolean;
    requiresFile: boolean;
    issuerHint?: string;
    sortOrder: number;
  }> = [
    {
      name: "Driver's licence",
      slug: "drivers-licence",
      reviewMode: "ADMIN_REVIEW",
      issuerMode: "THIRD_PARTY",
      requiresExpiry: true,
      requiresReference: true,
      requiresFile: true,
      issuerHint: "FRSC",
      sortOrder: 1,
    },
    {
      name: "Vehicle registration",
      slug: "vehicle-registration",
      reviewMode: "ADMIN_REVIEW",
      issuerMode: "THIRD_PARTY",
      requiresExpiry: true,
      requiresReference: true,
      requiresFile: true,
      sortOrder: 2,
    },
    {
      name: "Student enrolment",
      slug: "student-enrolment",
      reviewMode: "ADMIN_REVIEW",
      issuerMode: "THIRD_PARTY",
      requiresExpiry: true,
      requiresReference: true,
      requiresFile: true,
      issuerHint: "University or polytechnic",
      sortOrder: 3,
    },
    {
      name: "Trade certification",
      slug: "trade-certification",
      reviewMode: "ADMIN_REVIEW",
      issuerMode: "THIRD_PARTY",
      requiresExpiry: false,
      requiresReference: false,
      requiresFile: true,
      sortOrder: 4,
    },
    {
      name: "CV",
      slug: "cv",
      reviewMode: "SELF_DECLARED",
      issuerMode: "THIRD_PARTY",
      requiresExpiry: false,
      requiresReference: false,
      requiresFile: true,
      sortOrder: 5,
    },
    {
      // Issued by Afrizone on the evidence of platform history rather than any
      // third-party paper. This is the route by which a worker who is plainly
      // competent, but holds no formal certificate, can still pass a gate.
      name: "Afrizone verified dispatch rider",
      slug: "afrizone-verified-dispatch",
      reviewMode: "ADMIN_REVIEW",
      issuerMode: "AFRIZONE",
      requiresExpiry: false,
      requiresReference: false,
      requiresFile: false,
      sortOrder: 6,
    },
  ];
  for (const ct of credentialTypes) {
    await prisma.credentialType.create({ data: { ...ct, active: true } });
  }

  // ── One gated task, so a fresh seed actually shows the requirements gate ──
  //
  // Without this, every seeded task has no requirements, requirementsSummary is
  // null, and the whole of Phase 4 is invisible after a re-seed: no strip on the
  // admin card, no locked state in the worker app, nothing for anyone to look at
  // or test against. A feature that only appears once somebody hand-builds a
  // task is a feature that gets reported as missing.
  //
  // The dispatch task is the right one to gate: riding parcels around Lagos is
  // exactly the work that should need a licence, so the fixture reads as
  // plausible rather than as a demo prop.
  //
  // Requirements are attached HERE rather than at task creation because the
  // catalogues they point at are only created further down this file.
  const licence = await prisma.credentialType.findUnique({ where: { slug: "drivers-licence" } });
  const riding = await prisma.skill.findUnique({ where: { slug: "motorcycle-riding" } });
  if (licence && riding) {
    await prisma.taskCredentialRequirement.create({
      data: { taskId: tDispatch.id, credentialTypeId: licence.id },
    });
    await prisma.taskSkillRequirement.create({
      data: { taskId: tDispatch.id, skillId: riding.id },
    });
    await prisma.task.update({
      where: { id: tDispatch.id },
      data: {
        requiresIdentityVerified: true,
        // Same string services/eligibility.ts summarise() would produce. Kept in
        // sync by hand only because the seed cannot import from src/.
        requirementsSummary: "ID confirmed · Driver's licence · Motorcycle riding",
        requirementsVersion: 1,
      },
    });
  }

  // ── v2: Settings, templates ───────────────────────────────────────────────
  const templates: Array<{ key: string; value: string }> = [
    { key: "contract.default", value: "This agreement is between Afrizone and {{worker}} for {{task}}." },
    { key: "notify.application_approved", value: "Hi {{worker}}, your application for {{task}} was approved." },
    { key: "notify.payment_available", value: "Hi {{worker}}, your payment of {{amount}} is now available." },
  ];
  for (const t of templates) {
    await prisma.setting.create({ data: t });
  }

  const counts = {
    users: await prisma.user.count(),
    tasks: await prisma.task.count(),
    applications: await prisma.application.count(),
    timesheets: await prisma.timesheet.count(),
    payments: await prisma.payment.count(),
    jobs: await prisma.job.count(),
    candidates: await prisma.jobApplication.count(),
    taxRates: await prisma.taxRate.count(),
    categories: await prisma.category.count(),
    organizations: await prisma.organization.count(),
    orgMembers: await prisma.organizationMember.count(),
    settings: await prisma.setting.count(),
    clockEvents: await prisma.clockEvent.count(),
    withdrawals: await prisma.withdrawal.count(),
    contracts: await prisma.contract.count(),
    skills: await prisma.skill.count(),
    credentialTypes: await prisma.credentialType.count(),
  };
  console.log("Seed complete:", counts);
  console.log("Admin login: admin@afrizone.work / afrizone123");
  console.log(`Worker logins: <name>@afrizone.work / ${WORKER_PW}`);

  console.log("Applying the same data to wrangler dev's local D1 emulation...");
  await seedLocalD1();
  console.log("D1 (local) seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
