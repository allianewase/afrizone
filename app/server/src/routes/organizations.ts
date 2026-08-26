/**
 * Organizations: the businesses a person may act for, and the ones Afrizone
 * administers. A store and a courier company are the same shape here - what
 * differs is the work they receive, not who they are.
 *
 * WHY THESE ROUTES DO NOT USE requireAccountType, WHICH WILL LOOK LIKE AN
 * OVERSIGHT:
 *
 *   Membership is the authority here, not account type. `User.accountType`
 *   records how someone primarily uses the platform and decides which dashboard
 *   they land on; it is not a claim about which businesses they may touch, and
 *   every STORE account gives the same answer to it. Gating on it as well would
 *   buy nothing and would break a real case - an individual worker who also
 *   helps at their family's shop is one person with one login, an INDIVIDUAL
 *   account type, and a legitimate OrganizationMember row.
 *
 *   So requireAccountType is for gating features that belong to a KIND of
 *   account (courier-only, individual-only). Anything scoped to a particular
 *   business asks util/organization.ts instead, which answers the question that
 *   actually matters: may this person touch THIS organization.
 *
 * Two routers, mounted separately: the default one is for a business's own
 * people, `adminRouter` is for Afrizone staff. Splitting them keeps the approval
 * and suspension endpoints away from any path a member can reach, rather than
 * relying on a role check buried in a shared handler.
 */
import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { slugify } from "../types";
import { userActor, writeAudit } from "../util/audit";
import {
  kindLabel,
  listOrganizationsForUser,
  requireOrgAccess,
  ORG_KINDS,
  ORG_ROLES,
  ORG_STATUSES,
  type OrgKind,
  type OrgRole,
} from "../util/organization";

const router = Router();
export const adminRouter = Router();

/**
 * An organization as it goes over the wire.
 *
 * The full bank account number is returned only to an OWNER. STAFF do the work;
 * they have no reason to read the payout account, and staff turnover is exactly
 * the population you do not want holding it. `bankMasked` is enough to confirm
 * which account is on file, which is the only reason to display it.
 */
function publicOrg(org: any, viewerRole: OrgRole | "ADMIN") {
  const { bankAccountNumber, ...rest } = org;
  if (viewerRole === "OWNER" || viewerRole === "ADMIN") {
    return { ...rest, bankAccountNumber: bankAccountNumber ?? null };
  }
  return rest;
}

function memberShape(m: any) {
  return {
    id: m.id,
    userId: m.userId,
    role: m.role,
    createdAt: m.createdAt,
    name: m.user?.name ?? null,
    email: m.user?.email ?? null,
    phone: m.user?.phone ?? null,
  };
}

/** Last four digits, which is all a business needs to recognise its own account. */
function maskAccount(n: string): string {
  const digits = n.replace(/\D/g, "");
  return digits.length >= 4 ? `****${digits.slice(-4)}` : "****";
}

/** `?kind=STORE` as a validated value, or undefined for "any". */
function readKind(raw: unknown): OrgKind | undefined {
  return ORG_KINDS.includes(raw as OrgKind) ? (raw as OrgKind) : undefined;
}

// ── A business's own people ──────────────────────────────────────────────────

/**
 * GET /api/organizations?kind=STORE → every business this person may act for.
 *
 * Deliberately not "all organizations". A listing endpoint that returns the
 * platform's businesses and leaves filtering to the client is the same leak as
 * answering 403 instead of 404 on a single one, spread over one request instead
 * of many.
 */
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const orgs = await listOrganizationsForUser(req.user!.id, readKind(req.query.kind));
  res.json(orgs.map(({ org, role }) => ({ ...publicOrg(org, role), myRole: role })));
});

// GET /api/organizations/:id → one business, if the caller belongs to it.
router.get("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireOrgAccess(req.user!.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  res.json({
    ...publicOrg(access.org, access.membership.role as OrgRole),
    myRole: access.membership.role,
  });
});

/**
 * PATCH /api/organizations/:id → update its own details. OWNER only.
 *
 * Neither `status` nor `kind` is writable here at any role. A business
 * approving itself is the hole the PENDING default exists to close, and one
 * reclassifying itself from a store into a courier company would silently
 * change which work it can receive.
 */
router.patch("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireOrgAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const b = req.body || {};
  const data: any = {};
  for (const f of ["name", "phone", "email", "address", "bankName", "bankCode", "tin"]) {
    if (b[f] !== undefined) data[f] = b[f] === null ? null : String(b[f]);
  }
  if (b.lat !== undefined) data.lat = b.lat != null ? Number(b.lat) : null;
  if (b.lng !== undefined) data.lng = b.lng != null ? Number(b.lng) : null;
  if (b.bankAccountNumber !== undefined) {
    const n = b.bankAccountNumber == null ? null : String(b.bankAccountNumber).trim();
    data.bankAccountNumber = n;
    // Derived here rather than trusted from the client: a mask that does not
    // match the account is worse than no mask, because it is the only thing
    // anyone visually checks before a payout goes out.
    data.bankMasked = n ? maskAccount(n) : null;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const org = await prisma.organization.update({ where: { id: access.org.id }, data });
  // Payout details changing is worth a trail on its own: it is the one edit
  // here that redirects money.
  if (data.bankAccountNumber !== undefined || data.bankCode !== undefined) {
    await writeAudit(userActor(req.user!.id), "organization.payout.updated", "Organization", org.id, {
      bankMasked: org.bankMasked,
      bankCode: org.bankCode,
    });
  }
  res.json({ ...publicOrg(org, "OWNER"), myRole: "OWNER" });
});

// GET /api/organizations/:id/members → who can act for it. Any member may look.
router.get("/:id/members", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireOrgAccess(req.user!.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: access.org.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(members.map(memberShape));
});

/**
 * POST /api/organizations/:id/members → add someone by email or phone. OWNER only.
 *
 * The person must already have an Afrizone account. Creating one implicitly
 * would let an owner mint logins for addresses they do not control, and an
 * invitation flow is a different feature with different consent - not something
 * to smuggle in as a side effect of adding a colleague.
 *
 * Adding somebody does NOT change their accountType. Membership and account
 * type are separate facts, and overwriting the second here would silently move
 * an individual worker off their own dashboard.
 */
router.post("/:id/members", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireOrgAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const b = req.body || {};
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  const phone = b.phone ? String(b.phone).trim() : null;
  if (!email && !phone) return res.status(400).json({ error: "An email or phone number is required" });

  const role: OrgRole = b.role === "OWNER" ? "OWNER" : "STAFF";
  const user = await prisma.user.findFirst({
    where: email ? { email } : { phone: phone! },
    select: { id: true },
  });
  if (!user) {
    return res.status(404).json({ error: "No Afrizone account with that email or phone number" });
  }

  const existing = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: access.org.id, userId: user.id } },
  });
  if (existing) return res.status(409).json({ error: `They are already on this ${kindLabel(access.org.kind)}` });

  const member = await prisma.organizationMember.create({
    data: { organizationId: access.org.id, userId: user.id, role },
    include: { user: true },
  });
  await writeAudit(userActor(req.user!.id), "organization.member.added", "Organization", access.org.id, {
    userId: user.id,
    role,
  });
  res.status(201).json(memberShape(member));
});

/**
 * How many OWNERs would remain if this membership were removed or demoted?
 *
 * A business with no owner cannot add members, edit itself, or fix its own
 * payout account - it is unmanageable without an admin stepping in. That is a
 * support ticket created by a single mis-click, so it is refused rather than
 * allowed and apologised for.
 */
async function ownersBesides(organizationId: string, memberId: string): Promise<number> {
  return prisma.organizationMember.count({
    where: { organizationId, role: "OWNER", id: { not: memberId } },
  });
}

// PATCH /api/organizations/:id/members/:memberId → change standing. OWNER only.
router.patch("/:id/members/:memberId", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireOrgAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const role = req.body?.role;
  if (!ORG_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ORG_ROLES.join(", ")}` });
  }

  const member = await prisma.organizationMember.findFirst({
    where: { id: req.params.memberId, organizationId: access.org.id },
  });
  if (!member) return res.status(404).json({ error: "Not a member here" });

  if (member.role === "OWNER" && role !== "OWNER" && (await ownersBesides(access.org.id, member.id)) === 0) {
    return res.status(400).json({ error: "There must be at least one owner" });
  }

  const updated = await prisma.organizationMember.update({
    where: { id: member.id },
    data: { role },
    include: { user: true },
  });
  await writeAudit(
    userActor(req.user!.id),
    "organization.member.role.changed",
    "Organization",
    access.org.id,
    { userId: member.userId, role }
  );
  res.json(memberShape(updated));
});

// DELETE /api/organizations/:id/members/:memberId → remove someone. OWNER only.
router.delete("/:id/members/:memberId", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireOrgAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const member = await prisma.organizationMember.findFirst({
    where: { id: req.params.memberId, organizationId: access.org.id },
  });
  if (!member) return res.status(404).json({ error: "Not a member here" });

  if (member.role === "OWNER" && (await ownersBesides(access.org.id, member.id)) === 0) {
    return res.status(400).json({ error: "There must be at least one owner" });
  }

  await prisma.organizationMember.delete({ where: { id: member.id } });
  await writeAudit(
    userActor(req.user!.id),
    "organization.member.removed",
    "Organization",
    access.org.id,
    { userId: member.userId }
  );
  res.json({ ok: true });
});

// ── Afrizone staff ───────────────────────────────────────────────────────────

// GET /api/admin/organizations?kind=&status= → all of them, with a member count.
adminRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const kind = readKind(req.query.kind);
    const orgs = await prisma.organization.findMany({
      where: { ...(status ? { status } : {}), ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
    res.json(
      orgs.map((o) => {
        const { _count, ...rest } = o as any;
        return { ...publicOrg(rest, "ADMIN"), memberCount: _count.members };
      })
    );
  }
);

// GET /api/admin/organizations/:id → one, with its members.
adminRouter.get(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: { members: { include: { user: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    const { members, ...rest } = org as any;
    res.json({ ...publicOrg(rest, "ADMIN"), members: members.map(memberShape) });
  }
);

/**
 * POST /api/admin/organizations → register a store or a courier company.
 * SUPER_ADMIN.
 *
 * Lands PENDING unless an explicit status says otherwise, per the column
 * default. `ownerEmail` optionally seeds the first OWNER, because a business
 * with no owner is unmanageable and creating one then forgetting the owner is
 * the obvious way to produce that.
 */
adminRouter.post(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const b = req.body || {};
    const name = String(b.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    // Defaults STORE rather than being required, matching the column default -
    // every organization that existed before couriers were modelled was a store.
    const kind: OrgKind = readKind(b.kind) ?? "STORE";

    const slug = String(b.slug ?? "").trim() || slugify(name);
    if (!slug) return res.status(400).json({ error: "Could not derive a slug from that name" });
    const clash = await prisma.organization.findUnique({ where: { slug } });
    if (clash) return res.status(409).json({ error: `Something with slug "${slug}" already exists` });

    if (b.status !== undefined && !ORG_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of ${ORG_STATUSES.join(", ")}` });
    }

    // Resolved BEFORE the organization is created, so a typo in the owner's
    // email cannot leave an ownerless business behind.
    let ownerId: string | null = null;
    if (b.ownerEmail) {
      const owner = await prisma.user.findUnique({
        where: { email: String(b.ownerEmail).trim().toLowerCase() },
        select: { id: true },
      });
      if (!owner) return res.status(404).json({ error: "No Afrizone account with that owner email" });
      ownerId = owner.id;
    }

    const account = b.bankAccountNumber ? String(b.bankAccountNumber).trim() : null;
    const org = await prisma.organization.create({
      data: {
        kind,
        name,
        slug,
        phone: b.phone ?? null,
        email: b.email ?? null,
        address: b.address ?? null,
        lat: b.lat != null ? Number(b.lat) : null,
        lng: b.lng != null ? Number(b.lng) : null,
        bankAccountNumber: account,
        bankMasked: account ? maskAccount(account) : null,
        bankCode: b.bankCode ?? null,
        bankName: b.bankName ?? null,
        tin: b.tin ?? null,
        status: b.status ?? "PENDING",
      },
    });
    if (ownerId) {
      await prisma.organizationMember.create({
        data: { organizationId: org.id, userId: ownerId, role: "OWNER" },
      });
    }
    await writeAudit(userActor(req.user!.id), "organization.created", "Organization", org.id, {
      name: org.name,
      kind: org.kind,
      status: org.status,
      ownerId,
    });
    res.status(201).json(publicOrg(org, "ADMIN"));
  }
);

/**
 * PATCH /api/admin/organizations/:id → including approval and suspension.
 * SUPER_ADMIN.
 *
 * This is the only place `status` can change. Approving a business is what lets
 * it receive work and be paid, so it is a decision by a named person and it is
 * audited as one.
 *
 * `kind` is not editable here either. A store that became a courier company
 * would change what work it can receive, silently, on rows that already exist -
 * that is a new registration, not an edit.
 */
adminRouter.patch(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const b = req.body || {};
    const data: any = {};
    for (const f of ["name", "phone", "email", "address", "bankName", "bankCode", "tin"]) {
      if (b[f] !== undefined) data[f] = b[f] === null ? null : String(b[f]);
    }
    if (b.lat !== undefined) data.lat = b.lat != null ? Number(b.lat) : null;
    if (b.lng !== undefined) data.lng = b.lng != null ? Number(b.lng) : null;
    if (b.bankAccountNumber !== undefined) {
      const n = b.bankAccountNumber == null ? null : String(b.bankAccountNumber).trim();
      data.bankAccountNumber = n;
      data.bankMasked = n ? maskAccount(n) : null;
    }
    if (b.status !== undefined) {
      if (!ORG_STATUSES.includes(b.status)) {
        return res.status(400).json({ error: `status must be one of ${ORG_STATUSES.join(", ")}` });
      }
      data.status = b.status;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update" });

    const org = await prisma.organization.update({ where: { id: existing.id }, data });
    if (data.status && data.status !== existing.status) {
      await writeAudit(
        userActor(req.user!.id),
        "organization.status.changed",
        "Organization",
        org.id,
        { from: existing.status, to: org.status, kind: org.kind }
      );
    }
    res.json(publicOrg(org, "ADMIN"));
  }
);

export default router;
