/**
 * Stores: the ones a person may act for, and the ones Afrizone administers.
 *
 * WHY THESE ROUTES DO NOT USE requireAccountType, WHICH WILL LOOK LIKE AN
 * OVERSIGHT:
 *
 *   Membership is the authority here, not account type. `User.accountType`
 *   records how someone primarily uses the platform and decides which dashboard
 *   they land on; it is not a claim about which stores they may touch, and
 *   every STORE account gives the same answer to it. Gating on it as well would
 *   buy nothing and would break a real case - an individual worker who also
 *   helps at their family's shop is one person with one login, an INDIVIDUAL
 *   account type, and a legitimate StoreMember row.
 *
 *   So requireAccountType is for gating features that belong to a KIND of
 *   account (courier-only, individual-only). Anything scoped to a particular
 *   store asks util/store.ts instead, which answers the question that actually
 *   matters: may this person touch THIS store.
 *
 * Two routers, mounted separately: the default one is for a store's own people,
 * `adminRouter` is for Afrizone staff. Splitting them keeps the approval and
 * suspension endpoints away from any path a store member can reach, rather than
 * relying on a role check buried in a shared handler.
 */
import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { slugify } from "../types";
import { userActor, writeAudit } from "../util/audit";
import {
  listStoresForUser,
  requireStoreAccess,
  STORE_ROLES,
  STORE_STATUSES,
  type StoreRole,
} from "../util/store";

const router = Router();
export const adminRouter = Router();

/**
 * A store as it goes over the wire.
 *
 * The full bank account number is returned only to an OWNER. STAFF work orders;
 * they have no reason to read the payout account, and a store's staff turnover
 * is exactly the population you do not want holding it. `bankMasked` is enough
 * to confirm which account is on file, which is the only reason to display it.
 */
function publicStore(store: any, viewerRole: StoreRole | "ADMIN") {
  const { bankAccountNumber, ...rest } = store;
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

/** Last four digits, which is all a store needs to recognise its own account. */
function maskAccount(n: string): string {
  const digits = n.replace(/\D/g, "");
  return digits.length >= 4 ? `****${digits.slice(-4)}` : "****";
}

// ── A store's own people ─────────────────────────────────────────────────────

/**
 * GET /api/stores → every store this person may act for.
 *
 * Deliberately not "all stores". A listing endpoint that returns the platform's
 * stores and leaves filtering to the client is the same leak as answering 403
 * instead of 404 on a single store, spread over one request instead of many.
 */
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const stores = await listStoresForUser(req.user!.id);
  res.json(stores.map(({ store, role }) => ({ ...publicStore(store, role), myRole: role })));
});

// GET /api/stores/:id → one store, if the caller belongs to it.
router.get("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireStoreAccess(req.user!.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  res.json({
    ...publicStore(access.store, access.membership.role as StoreRole),
    myRole: access.membership.role,
  });
});

/**
 * PATCH /api/stores/:id → update the store's own details. OWNER only.
 *
 * `status` is NOT writable here at any role. A store approving itself is the
 * hole the PENDING default exists to close, so approval lives on the admin
 * router and nowhere else.
 */
router.patch("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireStoreAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
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

  const store = await prisma.store.update({ where: { id: access.store.id }, data });
  // Payout details changing is worth a trail on its own: it is the one edit
  // here that redirects money.
  if (data.bankAccountNumber !== undefined || data.bankCode !== undefined) {
    await writeAudit(userActor(req.user!.id), "store.payout.updated", "Store", store.id, {
      bankMasked: store.bankMasked,
      bankCode: store.bankCode,
    });
  }
  res.json({ ...publicStore(store, "OWNER"), myRole: "OWNER" });
});

// GET /api/stores/:id/members → who can act for this store. Any member may look.
router.get("/:id/members", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireStoreAccess(req.user!.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const members = await prisma.storeMember.findMany({
    where: { storeId: access.store.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(members.map(memberShape));
});

/**
 * POST /api/stores/:id/members → add someone by email or phone. OWNER only.
 *
 * The person must already have an Afrizone account. Creating one implicitly
 * would let a store owner mint logins for addresses they do not control, and an
 * invitation flow is a different feature with different consent - not something
 * to smuggle in as a side effect of adding a colleague.
 *
 * Adding somebody does NOT change their accountType. Membership and account
 * type are separate facts, and overwriting the second here would silently move
 * an individual worker off their own dashboard.
 */
router.post("/:id/members", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireStoreAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const b = req.body || {};
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  const phone = b.phone ? String(b.phone).trim() : null;
  if (!email && !phone) return res.status(400).json({ error: "An email or phone number is required" });

  const role: StoreRole = b.role === "OWNER" ? "OWNER" : "STAFF";
  const user = await prisma.user.findFirst({
    where: email ? { email } : { phone: phone! },
    select: { id: true },
  });
  if (!user) {
    return res.status(404).json({ error: "No Afrizone account with that email or phone number" });
  }

  const existing = await prisma.storeMember.findUnique({
    where: { storeId_userId: { storeId: access.store.id, userId: user.id } },
  });
  if (existing) return res.status(409).json({ error: "They are already on this store" });

  const member = await prisma.storeMember.create({
    data: { storeId: access.store.id, userId: user.id, role },
    include: { user: true },
  });
  await writeAudit(userActor(req.user!.id), "store.member.added", "Store", access.store.id, {
    userId: user.id,
    role,
  });
  res.status(201).json(memberShape(member));
});

/**
 * How many OWNERs would remain if this membership were removed or demoted?
 *
 * A store with no owner cannot add members, edit itself, or fix its own payout
 * account - it is unmanageable without an admin stepping in. That is a support
 * ticket created by a single mis-click, so it is refused rather than allowed
 * and apologised for.
 */
async function ownersBesides(storeId: string, memberId: string): Promise<number> {
  return prisma.storeMember.count({
    where: { storeId, role: "OWNER", id: { not: memberId } },
  });
}

// PATCH /api/stores/:id/members/:memberId → change someone's standing. OWNER only.
router.patch("/:id/members/:memberId", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireStoreAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const role = req.body?.role;
  if (!STORE_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${STORE_ROLES.join(", ")}` });
  }

  const member = await prisma.storeMember.findFirst({
    where: { id: req.params.memberId, storeId: access.store.id },
  });
  if (!member) return res.status(404).json({ error: "Not a member of this store" });

  if (member.role === "OWNER" && role !== "OWNER" && (await ownersBesides(access.store.id, member.id)) === 0) {
    return res.status(400).json({ error: "A store must keep at least one owner" });
  }

  const updated = await prisma.storeMember.update({
    where: { id: member.id },
    data: { role },
    include: { user: true },
  });
  await writeAudit(userActor(req.user!.id), "store.member.role.changed", "Store", access.store.id, {
    userId: member.userId,
    role,
  });
  res.json(memberShape(updated));
});

// DELETE /api/stores/:id/members/:memberId → remove someone. OWNER only.
router.delete("/:id/members/:memberId", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireStoreAccess(req.user!.id, req.params.id, { roles: ["OWNER"] });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const member = await prisma.storeMember.findFirst({
    where: { id: req.params.memberId, storeId: access.store.id },
  });
  if (!member) return res.status(404).json({ error: "Not a member of this store" });

  if (member.role === "OWNER" && (await ownersBesides(access.store.id, member.id)) === 0) {
    return res.status(400).json({ error: "A store must keep at least one owner" });
  }

  await prisma.storeMember.delete({ where: { id: member.id } });
  await writeAudit(userActor(req.user!.id), "store.member.removed", "Store", access.store.id, {
    userId: member.userId,
  });
  res.json({ ok: true });
});

// ── Afrizone staff ───────────────────────────────────────────────────────────

// GET /api/admin/stores → every store, with a member count.
adminRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const stores = await prisma.store.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
    res.json(
      stores.map((s) => {
        const { _count, ...rest } = s as any;
        return { ...publicStore(rest, "ADMIN"), memberCount: _count.members };
      })
    );
  }
);

// GET /api/admin/stores/:id → one store with its members.
adminRouter.get(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const store = await prisma.store.findUnique({
      where: { id: req.params.id },
      include: { members: { include: { user: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!store) return res.status(404).json({ error: "Store not found" });
    const { members, ...rest } = store as any;
    res.json({ ...publicStore(rest, "ADMIN"), members: members.map(memberShape) });
  }
);

/**
 * POST /api/admin/stores → register a store. SUPER_ADMIN.
 *
 * Lands PENDING unless an explicit status says otherwise, per the column
 * default. `ownerEmail` optionally seeds the first OWNER, because a store with
 * no owner is unmanageable and creating one then forgetting the owner is the
 * obvious way to produce that.
 */
adminRouter.post(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const b = req.body || {};
    const name = String(b.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const slug = String(b.slug ?? "").trim() || slugify(name);
    if (!slug) return res.status(400).json({ error: "Could not derive a slug from that name" });
    const clash = await prisma.store.findUnique({ where: { slug } });
    if (clash) return res.status(409).json({ error: `A store with slug "${slug}" already exists` });

    if (b.status !== undefined && !STORE_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of ${STORE_STATUSES.join(", ")}` });
    }

    // Resolved BEFORE the store is created, so a typo in the owner's email
    // cannot leave an ownerless store behind.
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
    const store = await prisma.store.create({
      data: {
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
      await prisma.storeMember.create({ data: { storeId: store.id, userId: ownerId, role: "OWNER" } });
    }
    await writeAudit(userActor(req.user!.id), "store.created", "Store", store.id, {
      name: store.name,
      status: store.status,
      ownerId,
    });
    res.status(201).json(publicStore(store, "ADMIN"));
  }
);

/**
 * PATCH /api/admin/stores/:id → including approval and suspension. SUPER_ADMIN.
 *
 * This is the only place `status` can change. Approving a store is what lets it
 * receive orders and be paid, so it is a decision by a named person and it is
 * audited as one.
 */
adminRouter.patch(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const existing = await prisma.store.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Store not found" });

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
      if (!STORE_STATUSES.includes(b.status)) {
        return res.status(400).json({ error: `status must be one of ${STORE_STATUSES.join(", ")}` });
      }
      data.status = b.status;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update" });

    const store = await prisma.store.update({ where: { id: existing.id }, data });
    if (data.status && data.status !== existing.status) {
      await writeAudit(userActor(req.user!.id), "store.status.changed", "Store", store.id, {
        from: existing.status,
        to: store.status,
      });
    }
    res.json(publicStore(store, "ADMIN"));
  }
);

export default router;
