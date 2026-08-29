/**
 * Delivery, from the three sides that touch one (MART_INTEGRATION.md §3.1, §4).
 *
 * ONE ROUTER, THREE AUDIENCES, and each action names who may take it:
 *
 *   THE STORE accepts or refuses the order and says when it is packed. This is
 *   its own decision and nobody else's - PartTime holds no stock data, so the
 *   shop's answer is the only availability signal that exists.
 *
 *   THE COURIER, meaning the one person holding the contract on the posting,
 *   marks collection, completes against the customer's code, and reports a
 *   failed attempt. Not "any courier": the guard is the contract, because a
 *   worker who can name an id must not be able to mark somebody else's job
 *   collected.
 *
 *   AFRIZONE STAFF read every order and can cancel one, and can act for a store
 *   that answered by telephone. That last one is not a back door, it is the
 *   normal case for a shop that does not use the portal - and it is audited as
 *   having been done by staff, not by the store.
 *
 * THE CUSTOMER'S DETAILS ARE NOT ON THE POSTING. They are returned only to the
 * courier who holds the job and to staff. §5 lets PartTime hold a display name,
 * a number, a door and an instruction, for as long as it takes to deliver one
 * order - and a public task list is not that.
 */
import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { userActor } from "../util/audit";
import { requireOrgAccess } from "../util/organization";
import {
  DELIVERY_STATES,
  completeDelivery,
  isTerminal,
  markPrepared,
  postCourierTask,
  stateLabel,
  transitionDelivery,
} from "../services/delivery";
import { isMartOutboundConfigured } from "../services/martOutbound";
import { RETENTION_DAYS, purgeCustomerData, purgeStatus } from "../services/deliveryPurge";

const router = Router();
export const adminRouter = Router();

/**
 * The order as everyone but the assigned courier and staff sees it: where it
 * came from, what state it is in, and nothing about the person waiting for it.
 */
function publicDelivery(d: any) {
  return {
    id: d.id,
    martOrderId: d.martOrderId,
    organizationId: d.organizationId,
    storeName: d.organization?.name ?? null,
    taskId: d.taskId,
    stockSource: d.stockSource,
    items: safeItems(d.items),
    pickupAddress: d.pickupAddress,
    pickupLat: d.pickupLat,
    pickupLng: d.pickupLng,
    goodsTotal: d.goodsTotal,
    deliveryFee: d.deliveryFee,
    expectedBy: d.expectedBy,
    status: d.status,
    statusLabel: stateLabel(d.status),
    preparedAt: d.preparedAt,
    storeDecidedAt: d.storeDecidedAt,
    storeNote: d.storeNote,
    assignedAt: d.assignedAt,
    pickedUpAt: d.pickedUpAt,
    deliveredAt: d.deliveredAt,
    failedAt: d.failedAt,
    failureReason: d.failureReason,
    createdAt: d.createdAt,
  };
}

/**
 * The same order, plus where it is going and who is waiting.
 *
 * `customerPurged` is returned explicitly rather than leaving the fields simply
 * null, because "we deleted this seven days ago, as promised" and "this order
 * never had a contact" are different facts and a blank field says neither.
 */
function withCustomer(d: any) {
  return {
    ...publicDelivery(d),
    dropoffAddress: d.dropoffAddress,
    dropoffLat: d.dropoffLat,
    dropoffLng: d.dropoffLng,
    dropoffInstructions: d.dropoffInstructions,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    customerPurged: !!d.customerPurgedAt,
  };
}

/** Items are stored as sent. A malformed blob must not break the whole screen. */
function safeItems(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Whether this user is Afrizone staff, for the routes both sides can call. */
function isStaff(req: AuthedRequest): boolean {
  return req.user?.role === "SUPER_ADMIN" || req.user?.role === "TASK_MANAGER";
}

/**
 * The store's own guard: a member of the organization this order belongs to, or
 * staff acting for a shop that answered by telephone.
 */
async function requireStoreSide(req: AuthedRequest, deliveryId: string) {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { organization: true },
  });
  // 404 rather than 403 for a delivery this caller cannot address, for the same
  // reason requireOrgAccess does: 403 confirms the row exists, which turns an id
  // parameter into a directory of every order on the platform.
  if (!delivery) return { ok: false as const, status: 404, error: "Not found" };
  if (isStaff(req)) return { ok: true as const, delivery, asStaff: true };

  const access = await requireOrgAccess(req.user!.id, delivery.organizationId);
  if (!access.ok) return { ok: false as const, status: access.status, error: access.error };
  return { ok: true as const, delivery, asStaff: false };
}

/**
 * The courier's guard: the one person holding a contract on this order's
 * posting. Not a role check - every courier account answers that the same way.
 */
async function requireAssignedCourier(req: AuthedRequest, deliveryId: string) {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { organization: true },
  });
  if (!delivery) return { ok: false as const, status: 404, error: "Not found" };
  if (!delivery.taskId) return { ok: false as const, status: 404, error: "Not found" };

  const contract = await prisma.contract.findFirst({
    where: { taskId: delivery.taskId, workerId: req.user!.id },
    select: { id: true, status: true },
  });
  if (!contract) return { ok: false as const, status: 404, error: "Not found" };
  return { ok: true as const, delivery, contract };
}

// ── The store ────────────────────────────────────────────────────────────────

/**
 * GET /api/organizations/:id/deliveries?status=
 *
 * Lives here rather than in routes/organizations.ts so that everything about a
 * delivery is in one file. Mounted on the organizations path because that is
 * what it is scoped to, and the id in the path is what requireOrgAccess checks.
 */
router.get("/organizations/:id/deliveries", requireAuth, async (req: AuthedRequest, res: Response) => {
  const access = await requireOrgAccess(req.user!.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await prisma.delivery.findMany({
    where: {
      organizationId: access.org.id,
      ...(status && DELIVERY_STATES.includes(status as any) ? { status } : {}),
    },
    include: { organization: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // The store gets the drop-off: they are packing the order and, for a
  // collection dispute, they need to be able to say where it was meant to go.
  res.json(rows.map(withCustomer));
});

/**
 * POST /api/deliveries/:id/accept → the store will fulfil this.
 *
 * Accepting is what posts the courier job, and the two are deliberately one
 * action rather than two: a store that accepted and then had to remember a
 * second step would leave orders sitting accepted and unposted, which looks
 * exactly like a delivery nobody wanted.
 */
router.post("/deliveries/:id/accept", requireAuth, async (req: AuthedRequest, res: Response) => {
  const guard = await requireStoreSide(req, req.params.id);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const actor = userActor(req.user!.id);
  const moved = await transitionDelivery(guard.delivery.id, "STORE_ACCEPTED", actor, {
    meta: guard.asStaff ? { onBehalfOfStore: true } : {},
  });
  if (!moved.ok) return res.status(moved.status).json({ error: moved.error });

  const posted = await postCourierTask(guard.delivery.id, actor);
  const fresh = await prisma.delivery.findUnique({
    where: { id: guard.delivery.id },
    include: { organization: true },
  });

  // The order is accepted either way - that state change is committed. If the
  // posting failed, say so plainly rather than reporting success: an accepted
  // order with no job behind it is the failure that looks like nothing.
  res.json({
    ...withCustomer(fresh),
    posted: posted.posted || posted.reason === "ALREADY_POSTED",
    ...(posted.posted || posted.reason === "ALREADY_POSTED"
      ? {}
      : { warning: `The order is accepted but no courier job could be posted (${posted.reason}). Afrizone has been told.` }),
  });
});

/** POST /api/deliveries/:id/reject → the store cannot fulfil it. A reason is required. */
router.post("/deliveries/:id/reject", requireAuth, async (req: AuthedRequest, res: Response) => {
  const guard = await requireStoreSide(req, req.params.id);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  // Required, because rejection is the ONLY unavailability signal PartTime has -
  // it holds no stock data - and "no" without a reason tells Mart nothing they
  // can act on. §6 D3 leaves what they do with it to them.
  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "Say why the order cannot be fulfilled" });

  const moved = await transitionDelivery(guard.delivery.id, "STORE_REJECTED", userActor(req.user!.id), {
    reason,
    meta: guard.asStaff ? { onBehalfOfStore: true } : {},
  });
  if (!moved.ok) return res.status(moved.status).json({ error: moved.error });

  const fresh = await prisma.delivery.findUnique({
    where: { id: guard.delivery.id },
    include: { organization: true },
  });
  res.json(withCustomer(fresh));
});

/** POST /api/deliveries/:id/prepared → packed and waiting for collection. */
router.post("/deliveries/:id/prepared", requireAuth, async (req: AuthedRequest, res: Response) => {
  const guard = await requireStoreSide(req, req.params.id);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const marked = await markPrepared(guard.delivery.id, userActor(req.user!.id));
  if (!marked.ok) return res.status(marked.status).json({ error: marked.error });

  const fresh = await prisma.delivery.findUnique({
    where: { id: guard.delivery.id },
    include: { organization: true },
  });
  res.json(withCustomer(fresh));
});

// ── The courier ──────────────────────────────────────────────────────────────

/**
 * GET /api/me/deliveries → the orders this courier is carrying.
 *
 * Keyed on the contracts they hold, not on their account type: what makes a
 * delivery theirs is having been given the job.
 */
router.get("/me/deliveries", requireAuth, async (req: AuthedRequest, res: Response) => {
  const contracts = await prisma.contract.findMany({
    where: { workerId: req.user!.id, task: { kind: "DELIVERY" } },
    select: { taskId: true, id: true, status: true },
  });
  if (contracts.length === 0) return res.json([]);

  const rows = await prisma.delivery.findMany({
    where: { taskId: { in: contracts.map((c) => c.taskId) } },
    include: { organization: true },
    orderBy: { createdAt: "desc" },
  });
  const byTask = new Map(contracts.map((c) => [c.taskId, c]));
  res.json(
    rows.map((d) => ({
      ...withCustomer(d),
      contractId: d.taskId ? byTask.get(d.taskId)?.id ?? null : null,
      contractStatus: d.taskId ? byTask.get(d.taskId)?.status ?? null : null,
    }))
  );
});

/** GET /api/deliveries/:id → one order, to the courier holding it. */
router.get("/deliveries/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const guard = await requireAssignedCourier(req, req.params.id);
  if (!guard.ok) {
    // Fall back to the store side, so a shopkeeper opening a link to their own
    // order is not told it does not exist.
    const store = await requireStoreSide(req, req.params.id);
    if (!store.ok) return res.status(store.status).json({ error: store.error });
    const full = await prisma.delivery.findUnique({
      where: { id: store.delivery.id },
      include: { organization: true },
    });
    return res.json(withCustomer(full));
  }
  const full = await prisma.delivery.findUnique({
    where: { id: guard.delivery.id },
    include: { organization: true },
  });
  res.json({ ...withCustomer(full), contractId: guard.contract.id });
});

/** POST /api/deliveries/:id/picked-up → the goods have left the shop. */
router.post("/deliveries/:id/picked-up", requireAuth, async (req: AuthedRequest, res: Response) => {
  const guard = await requireAssignedCourier(req, req.params.id);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const moved = await transitionDelivery(guard.delivery.id, "PICKED_UP", userActor(req.user!.id), {
    meta: { contractId: guard.contract.id },
  });
  if (!moved.ok) return res.status(moved.status).json({ error: moved.error });

  const fresh = await prisma.delivery.findUnique({
    where: { id: guard.delivery.id },
    include: { organization: true },
  });
  res.json(withCustomer(fresh));
});

/**
 * POST /api/deliveries/:id/complete → the customer's code, checked with Mart.
 *
 * The only route that can produce a delivered order. See completeDelivery: a
 * courier tapping a button is not a delivery, and 503 here means "we could not
 * ask", which is not the same as a wrong code and must not be shown as one.
 */
router.post("/deliveries/:id/complete", requireAuth, async (req: AuthedRequest, res: Response) => {
  const guard = await requireAssignedCourier(req, req.params.id);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const result = await completeDelivery(
    guard.delivery.id,
    String(req.body?.code ?? ""),
    userActor(req.user!.id)
  );
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      ...(result.remainingAttempts !== undefined
        ? { remainingAttempts: result.remainingAttempts }
        : {}),
      ...(result.status === 503 ? { retryable: true } : {}),
    });
  }

  const fresh = await prisma.delivery.findUnique({
    where: { id: guard.delivery.id },
    include: { organization: true },
  });
  res.json(withCustomer(fresh));
});

/**
 * POST /api/deliveries/:id/failed → attempted and not completed.
 *
 * MART_INTEGRATION.md §6 D6 is open: whether a failed attempt is paid, who
 * decides, and whether returning the goods is a second paid leg. Nothing here
 * answers that - it records the fact and tells Mart, and the contract stays
 * where it is so that whoever decides has something to decide about.
 */
router.post("/deliveries/:id/failed", requireAuth, async (req: AuthedRequest, res: Response) => {
  const guard = await requireAssignedCourier(req, req.params.id);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "Say what happened" });

  const moved = await transitionDelivery(guard.delivery.id, "FAILED", userActor(req.user!.id), {
    reason,
    meta: { contractId: guard.contract.id },
  });
  if (!moved.ok) return res.status(moved.status).json({ error: moved.error });

  const fresh = await prisma.delivery.findUnique({
    where: { id: guard.delivery.id },
    include: { organization: true },
  });
  res.json(withCustomer(fresh));
});

// ── Afrizone staff ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/deliveries?status=&storeId=
 *
 * The operations board. `stuck=1` narrows it to orders that are live and are
 * waiting on somebody - which is the list an operator actually works from,
 * rather than every order ever placed.
 */
adminRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
    const stuck = req.query.stuck === "1" || req.query.stuck === "true";

    const rows = await prisma.delivery.findMany({
      where: {
        ...(status && DELIVERY_STATES.includes(status as any) ? { status } : {}),
        ...(storeId ? { organizationId: storeId } : {}),
        ...(stuck
          ? { status: { in: ["RECEIVED", "STORE_ACCEPTED", "COURIER_ASSIGNED", "PICKED_UP"] } }
          : {}),
      },
      include: { organization: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json({
      // Whether the other half of the integration is wired up. An operator
      // looking at an order that will not complete needs to know the difference
      // between a courier problem and an unconfigured verifier.
      martConfigured: isMartOutboundConfigured(),
      deliveries: rows.map(withCustomer),
    });
  }
);

/**
 * GET /api/admin/deliveries/purge → is the retention promise being kept?
 *
 * MART_INTEGRATION.md §5: "the purge is auditable and its failure visible". A
 * screen showing the backlog and when the sweep last ran is what makes it
 * visible; without one, a cron that stopped firing in March is discovered by
 * somebody asking an awkward question in November.
 *
 * ABOVE /:id, because Express matches in order and "purge" would otherwise be
 * read as a delivery id.
 */
adminRouter.get(
  "/purge",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (_req: AuthedRequest, res: Response) => {
    const status = await purgeStatus();
    res.json({ ...status, retentionDays: RETENTION_DAYS });
  }
);

/**
 * POST /api/admin/deliveries/purge → run the sweep now.
 *
 * SUPER_ADMIN only. The scheduled run is what actually keeps the promise; this
 * is for draining a backlog after an outage, and for proving to somebody asking
 * that the thing works. It does exactly what the cron does, including writing
 * its audit row.
 */
adminRouter.post(
  "/purge",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const result = await purgeCustomerData(userActor(req.user!.id));
    res.json({ ...result, retentionDays: RETENTION_DAYS });
  }
);

/** GET /api/admin/deliveries/:id → one order, with its trail. */
adminRouter.get(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const delivery = await prisma.delivery.findUnique({
      where: { id: req.params.id },
      include: { organization: true, task: true },
    });
    if (!delivery) return res.status(404).json({ error: "Not found" });

    const trail = await prisma.auditLog.findMany({
      where: { entity: "Delivery", entityId: delivery.id },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    const contracts = delivery.taskId
      ? await prisma.contract.findMany({
          where: { taskId: delivery.taskId },
          include: { worker: { select: { id: true, name: true, phone: true } } },
        })
      : [];

    res.json({
      ...withCustomer(delivery),
      task: delivery.task
        ? { id: delivery.task.id, title: delivery.task.title, status: delivery.task.status }
        : null,
      couriers: contracts.map((c) => ({
        contractId: c.id,
        status: c.status,
        workerId: c.workerId,
        name: c.worker?.name ?? null,
        phone: c.worker?.phone ?? null,
      })),
      trail: trail.map((t) => ({
        id: t.id,
        action: t.action,
        createdAt: t.createdAt,
        meta: t.meta,
      })),
    });
  }
);

/**
 * POST /api/admin/deliveries/:id/cancel → called off.
 *
 * Staff only, and terminal. Mart is NOT told: §4 lists no event for it, because
 * an order called off was called off by one of the two systems and both already
 * know.
 */
adminRouter.post(
  "/:id/cancel",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Say why it is being cancelled" });

    const moved = await transitionDelivery(req.params.id, "CANCELLED", userActor(req.user!.id), {
      reason,
    });
    if (!moved.ok) return res.status(moved.status).json({ error: moved.error });

    const fresh = await prisma.delivery.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    res.json(withCustomer(fresh));
  }
);

/**
 * POST /api/admin/deliveries/:id/reopen → the courier vanished; offer it again.
 *
 * §6 D5, the half that is settled: a courier who accepts and then disappears
 * releases the job. How long that takes before somebody notices is still open,
 * which is why this is a person pressing a button rather than a timer.
 */
adminRouter.post(
  "/:id/reopen",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const delivery = await prisma.delivery.findUnique({ where: { id: req.params.id } });
    if (!delivery) return res.status(404).json({ error: "Not found" });
    if (isTerminal(delivery.status)) {
      return res.status(409).json({ error: `This order is already "${stateLabel(delivery.status)}"` });
    }

    const actor = userActor(req.user!.id);
    const moved = await transitionDelivery(delivery.id, "STORE_ACCEPTED", actor, {
      reason: String(req.body?.reason ?? "").trim() || "The courier did not collect",
    });
    if (!moved.ok) return res.status(moved.status).json({ error: moved.error });

    // The posting has to go back on the board, or a re-opened order is one
    // nobody can see. postCourierTask adopts the existing task where there is
    // one, so this does not mint a second job for the same order.
    const posted = await postCourierTask(delivery.id, actor);
    if (delivery.taskId) {
      await prisma.task.update({ where: { id: delivery.taskId }, data: { status: "OPEN" } });
    }

    const fresh = await prisma.delivery.findUnique({
      where: { id: delivery.id },
      include: { organization: true },
    });
    res.json({ ...withCustomer(fresh), taskId: posted.taskId ?? delivery.taskId });
  }
);

export default router;
