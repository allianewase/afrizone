/**
 * The worker's own half of the talent profile: skills they declare, and
 * credentials they submit for checking.
 *
 * Mounted under /api/me alongside routes/me.ts, which is already long enough;
 * everything here is one coherent feature and reads better together.
 *
 * WHAT COUNTS, AND WHY IT IS NOT SYMMETRICAL:
 *
 *   Skills are self-declared and gate nothing, so there is no review step and
 *   no verification state to expose. Declaring one is a single replace-set
 *   call, not a request per tap - the picker is a multi-select, and a worker on
 *   a patchy connection should not end up with half their choices saved.
 *
 *   Credentials are submitted for a person to check, so they carry a status,
 *   and the worker cannot set it. Anything the worker edits goes back to
 *   PENDING, because the facts a reviewer approved are no longer the facts on
 *   the row.
 */
import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import { isCredentialValid, isCredentialExpiring } from "../types";
import { writeAudit } from "../util/audit";

const router = Router();

// ── Skills ───────────────────────────────────────────────────────────────────

// GET /api/me/skills → the worker's declared skills, with the catalogue entry.
router.get("/skills", requireAuth, async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.workerSkill.findMany({
    where: { workerId: req.user!.id },
    include: { skill: true },
  });
  res.json(
    rows.map((r) => ({
      skillId: r.skillId,
      slug: r.skill.slug,
      name: r.skill.name,
      group: r.skill.group,
      years: r.years,
      // Retired from the catalogue but still declared by this worker. Shown so
      // the profile does not silently lose an entry the worker put there.
      retired: !r.skill.active,
    }))
  );
});

/**
 * PUT /api/me/skills → body {skills: [{skillId, years?}] | [skillId]}
 *
 * REPLACE-SET, not incremental. The whole selection arrives in one request and
 * becomes the whole truth, so a dropped connection mid-edit leaves the previous
 * set intact rather than a partial one.
 */
router.put("/skills", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const raw = req.body?.skills;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: "skills must be an array" });
  }
  if (raw.length > 50) {
    return res.status(400).json({ error: "That is more skills than we can store (max 50)" });
  }

  // Accept either a bare id or {skillId, years}, so the client can add years
  // later without a new endpoint.
  const wanted = new Map<string, number | null>();
  for (const entry of raw) {
    const skillId = typeof entry === "string" ? entry : entry?.skillId;
    if (typeof skillId !== "string" || !skillId) {
      return res.status(400).json({ error: "Each skill needs a skillId" });
    }
    let years: number | null = null;
    if (entry && typeof entry === "object" && entry.years != null) {
      const n = Number(entry.years);
      if (!Number.isInteger(n) || n < 0 || n > 70) {
        return res.status(400).json({ error: "years must be a whole number between 0 and 70" });
      }
      years = n;
    }
    // A duplicate in the payload is the client's problem to not send, but
    // collapsing it here is kinder than a unique-constraint error.
    wanted.set(skillId, years);
  }

  // Every id must exist AND still be active: a retired skill must not be newly
  // declarable, even though one already declared is kept and shown.
  const ids = [...wanted.keys()];
  const known = ids.length
    ? await prisma.skill.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } })
    : [];
  if (known.length !== ids.length) {
    const knownIds = new Set(known.map((s) => s.id));
    const bad = ids.filter((id) => !knownIds.has(id));
    return res.status(400).json({ error: `Unknown or retired skill: ${bad.join(", ")}` });
  }

  const existing = await prisma.workerSkill.findMany({ where: { workerId } });
  const existingById = new Map(existing.map((e) => [e.skillId, e]));

  const toRemove = existing.filter((e) => !wanted.has(e.skillId)).map((e) => e.id);
  const toCreate = ids
    .filter((id) => !existingById.has(id))
    .map((id) => ({ workerId, skillId: id, years: wanted.get(id) ?? null }));
  const toUpdate = ids
    .filter((id) => existingById.has(id) && existingById.get(id)!.years !== (wanted.get(id) ?? null))
    .map((id) => ({ id: existingById.get(id)!.id, years: wanted.get(id) ?? null }));

  // Diffed rather than delete-all-then-insert so createdAt survives on skills
  // the worker is keeping - "declared since" is worth something to a reviewer.
  await prisma.$transaction([
    ...(toRemove.length ? [prisma.workerSkill.deleteMany({ where: { id: { in: toRemove } } })] : []),
    ...(toCreate.length ? [prisma.workerSkill.createMany({ data: toCreate })] : []),
    ...toUpdate.map((u) => prisma.workerSkill.update({ where: { id: u.id }, data: { years: u.years } })),
  ]);

  const rows = await prisma.workerSkill.findMany({
    where: { workerId },
    include: { skill: true },
  });
  res.json(
    rows.map((r) => ({
      skillId: r.skillId,
      slug: r.skill.slug,
      name: r.skill.name,
      group: r.skill.group,
      years: r.years,
      retired: !r.skill.active,
    }))
  );
});

// ── Credentials ──────────────────────────────────────────────────────────────

type CredentialWithType = {
  id: string;
  title: string;
  issuer: string | null;
  referenceNumber: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  documentId: string | null;
  status: string;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  credentialType: {
    id: string;
    name: string;
    slug: string;
    reviewMode: string;
    issuerMode: string;
    requiresExpiry: boolean;
    requiresReference: boolean;
    requiresFile: boolean;
  };
};

/**
 * The five states the worker's badge shows, derived here so the app and the
 * admin console cannot disagree about what a row means:
 *
 *   SELF_DECLARED     - "Added by you". Recorded on the worker's word; nobody
 *                       will check it, so it never says "checked by us" and it
 *                       never satisfies a gate.
 *   PENDING           - "Being checked".
 *   VERIFIED, in date - "Checked by us".
 *   VERIFIED, lapsed  - "Expired". Computed against the clock, never stored.
 *   REJECTED          - "Send a clearer copy", with the reviewer's reason.
 *   REVOKED           - withdrawn after the fact by an admin.
 */
function credentialState(c: CredentialWithType, now = new Date()) {
  if (c.credentialType.reviewMode === "SELF_DECLARED") return "SELF_DECLARED";
  if (c.status === "VERIFIED") return isCredentialValid(c, now) ? "VERIFIED" : "EXPIRED";
  return c.status; // PENDING | REJECTED | REVOKED
}

export function formatCredential(c: CredentialWithType, now = new Date()) {
  return {
    id: c.id,
    title: c.title,
    issuer: c.issuer,
    referenceNumber: c.referenceNumber,
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    documentId: c.documentId,
    status: c.status,
    state: credentialState(c, now),
    // Whether the platform can currently rely on it. Derived every time it is
    // asked; see the note on the Credential model.
    valid: isCredentialValid(c, now),
    expiringSoon: isCredentialExpiring(c, 30, now),
    rejectionReason: c.rejectionReason,
    reviewedAt: c.reviewedAt,
    createdAt: c.createdAt,
    credentialType: c.credentialType,
  };
}

const CREDENTIAL_INCLUDE = {
  credentialType: {
    select: {
      id: true,
      name: true,
      slug: true,
      reviewMode: true,
      issuerMode: true,
      requiresExpiry: true,
      requiresReference: true,
      requiresFile: true,
    },
  },
} as const;

// GET /api/me/credentials → the worker's credentials, newest first.
router.get("/credentials", requireAuth, async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.credential.findMany({
    where: { workerId: req.user!.id },
    include: CREDENTIAL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  res.json(rows.map((r) => formatCredential(r as CredentialWithType, now)));
});

/** Parse a date the client sent, distinguishing "absent" from "unparseable". */
function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Confirm an uploaded document belongs to this worker before attaching it.
 *
 * Without this a worker could attach ANOTHER worker's document id to their own
 * credential - putting someone else's licence in front of a reviewer under
 * their name, and pulling a private document into a response they can read.
 */
async function resolveOwnDocument(
  workerId: string,
  documentId: unknown
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (documentId === undefined) return { ok: true, id: null };
  if (documentId === null || documentId === "") return { ok: true, id: null };
  if (typeof documentId !== "string") return { ok: false, error: "documentId must be a string" };

  const doc = await prisma.kycDocument.findFirst({
    where: { id: documentId, userId: workerId },
    select: { id: true },
  });
  if (!doc) return { ok: false, error: "That document was not found" };
  return { ok: true, id: doc.id };
}

// POST /api/me/credentials → submit a credential for checking.
router.post("/credentials", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const b = req.body || {};

  const credentialTypeId = String(b.credentialTypeId ?? "");
  if (!credentialTypeId) return res.status(400).json({ error: "credentialTypeId is required" });

  const type = await prisma.credentialType.findUnique({ where: { id: credentialTypeId } });
  if (!type || !type.active) {
    return res.status(400).json({ error: "That credential type is not available" });
  }
  if (type.issuerMode === "AFRIZONE") {
    // Afrizone-issued credentials are granted by an admin on the evidence of
    // platform history. A worker awarding one to themselves would defeat the
    // point of it entirely.
    return res.status(403).json({ error: "That credential is issued by Afrizone, not submitted" });
  }

  const title = String(b.title ?? "").trim() || type.name;

  const issuedAt = parseDate(b.issuedAt);
  const expiresAt = parseDate(b.expiresAt);
  if (issuedAt === undefined && b.issuedAt !== undefined) {
    return res.status(400).json({ error: "issuedAt is not a valid date" });
  }
  if (expiresAt === undefined && b.expiresAt !== undefined) {
    return res.status(400).json({ error: "expiresAt is not a valid date" });
  }
  if (issuedAt && expiresAt && expiresAt.getTime() <= issuedAt.getTime()) {
    return res.status(400).json({ error: "The expiry date must be after the issue date" });
  }

  const reference = b.referenceNumber ? String(b.referenceNumber).trim() : null;

  if (type.requiresExpiry && !expiresAt) {
    return res.status(400).json({ error: `${type.name} needs an expiry date` });
  }
  if (type.requiresReference && !reference) {
    return res.status(400).json({ error: `${type.name} needs its reference number` });
  }

  const doc = await resolveOwnDocument(workerId, b.documentId);
  if (!doc.ok) return res.status(400).json({ error: doc.error });
  if (type.requiresFile && !doc.id) {
    return res.status(400).json({ error: `${type.name} needs a photo or PDF of the document` });
  }

  const created = await prisma.credential.create({
    data: {
      workerId,
      credentialTypeId: type.id,
      title,
      issuer: b.issuer ? String(b.issuer).trim() : null,
      referenceNumber: reference,
      issuedAt: issuedAt ?? null,
      expiresAt: expiresAt ?? null,
      documentId: doc.id,
      // The worker never sets this. A SELF_DECLARED type also starts PENDING
      // and simply never gets reviewed - it is displayed as "Added by you" and
      // is not eligible for the review queue.
      status: "PENDING",
    },
    include: CREDENTIAL_INCLUDE,
  });

  await writeAudit(
    { type: "USER", userId: workerId },
    "credential.submitted",
    "Credential",
    created.id,
    { credentialType: type.slug }
  );

  res.status(201).json(formatCredential(created as CredentialWithType));
});

/**
 * PATCH /api/me/credentials/:id → correct the details.
 *
 * ANY edit returns the row to PENDING and clears the review. That is the
 * honest rule: a reviewer approved a specific set of facts, and if the worker
 * changes the reference number or the expiry date, those facts no longer hold.
 * Letting an edit ride on the old approval would turn "checked by us" into a
 * statement about a document nobody has seen.
 */
router.patch("/credentials/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const existing = await prisma.credential.findFirst({
    where: { id: req.params.id, workerId },
    include: CREDENTIAL_INCLUDE,
  });
  if (!existing) return res.status(404).json({ error: "Credential not found" });

  const b = req.body || {};
  const type = existing.credentialType;
  const data: Record<string, unknown> = {};

  if (b.title !== undefined) {
    const t = String(b.title).trim();
    if (!t) return res.status(400).json({ error: "title cannot be empty" });
    data.title = t;
  }
  if (b.issuer !== undefined) data.issuer = b.issuer ? String(b.issuer).trim() : null;

  if (b.referenceNumber !== undefined) {
    const ref = b.referenceNumber ? String(b.referenceNumber).trim() : null;
    if (type.requiresReference && !ref) {
      return res.status(400).json({ error: `${type.name} needs its reference number` });
    }
    data.referenceNumber = ref;
  }

  if (b.issuedAt !== undefined) {
    const d = parseDate(b.issuedAt);
    if (d === undefined) return res.status(400).json({ error: "issuedAt is not a valid date" });
    data.issuedAt = d;
  }
  if (b.expiresAt !== undefined) {
    const d = parseDate(b.expiresAt);
    if (d === undefined) return res.status(400).json({ error: "expiresAt is not a valid date" });
    if (type.requiresExpiry && !d) {
      return res.status(400).json({ error: `${type.name} needs an expiry date` });
    }
    data.expiresAt = d;
  }

  const issuedAt = (data.issuedAt as Date | null | undefined) ?? existing.issuedAt;
  const expiresAt = (data.expiresAt as Date | null | undefined) ?? existing.expiresAt;
  if (issuedAt && expiresAt && expiresAt.getTime() <= issuedAt.getTime()) {
    return res.status(400).json({ error: "The expiry date must be after the issue date" });
  }

  if (b.documentId !== undefined) {
    const doc = await resolveOwnDocument(workerId, b.documentId);
    if (!doc.ok) return res.status(400).json({ error: doc.error });
    if (type.requiresFile && !doc.id) {
      return res.status(400).json({ error: `${type.name} needs a photo or PDF of the document` });
    }
    data.documentId = doc.id;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  // Back to the queue, with the previous decision cleared.
  data.status = "PENDING";
  data.reviewedById = null;
  data.reviewedAt = null;
  data.rejectionReason = null;

  const updated = await prisma.credential.update({
    where: { id: existing.id },
    data,
    include: CREDENTIAL_INCLUDE,
  });

  await writeAudit(
    { type: "USER", userId: workerId },
    "credential.resubmitted",
    "Credential",
    updated.id,
    { previousStatus: existing.status, fields: Object.keys(b) }
  );

  res.json(formatCredential(updated as CredentialWithType));
});

// DELETE /api/me/credentials/:id → withdraw it.
//
// Allowed at any status, including VERIFIED: it is the worker's own document,
// and keeping it hostage because it currently satisfies a gate would be the
// wrong trade. Audited, because removing a verified credential is exactly the
// sort of change someone will later need explained.
router.delete("/credentials/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const existing = await prisma.credential.findFirst({
    where: { id: req.params.id, workerId },
    include: CREDENTIAL_INCLUDE,
  });
  if (!existing) return res.status(404).json({ error: "Credential not found" });

  await prisma.credential.delete({ where: { id: existing.id } });

  await writeAudit(
    { type: "USER", userId: workerId },
    "credential.withdrawn",
    "Credential",
    existing.id,
    { credentialType: existing.credentialType.slug, status: existing.status }
  );

  res.json({ ok: true });
});

export default router;
