/**
 * Row-level access control for stores.
 *
 * The role check is the easy half of RBAC and it is not what protects a store.
 * "Is this caller a store account?" is answered by requireAccountType in
 * auth.ts; "may this caller see THIS store's orders?" cannot be, because every
 * store account gives the same answer. That second question is ownership, and
 * it has to be asked per row, on the server, on every request that names a
 * store.
 *
 * Shaped exactly like util/assignment.ts's requireAssignedTask(), which exists
 * because two endpoints took a bare taskId from the request body and looked it
 * up by id alone - so any authenticated worker could bill hours against a task
 * they had never been given. A storeId taken from a path parameter is the same
 * hole with a different noun, and this is the same answer.
 *
 * Returned as a result object rather than thrown or written as middleware, for
 * two reasons. Middleware cannot see a storeId that arrives in a body rather
 * than a path. And routes/tasks.ts already carries the lesson that router-level
 * guards are the wrong granularity here: mounting one on the router would have
 * caught GET / and GET /:id, which must stay open to workers.
 */
import type { Store, StoreMember } from "@prisma/client";
import { prisma } from "../prisma";

/** Standing within one store. Not User.role, and not User.accountType. */
export type StoreRole = "OWNER" | "STAFF";
export const STORE_ROLES: StoreRole[] = ["OWNER", "STAFF"];

/** PENDING until Afrizone approves it; SUSPENDED takes it back out of service. */
export type StoreStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
export const STORE_STATUSES: StoreStatus[] = ["PENDING", "ACTIVE", "SUSPENDED"];

export type StoreAccessResult =
  | { ok: true; store: Store; membership: StoreMember }
  | { ok: false; status: 403 | 404; error: string };

/**
 * May this user act for this store?
 *
 * A caller who is not a member gets 404, not 403. 403 confirms the store exists
 * and that the caller merely lacks access, which turns this endpoint into a
 * directory of every store on the platform for anyone willing to enumerate ids.
 * A non-member has no business learning the difference between "not yours" and
 * "not real".
 *
 * `requireActive` gates on the store's own status: a PENDING store has not been
 * approved and a SUSPENDED one has been taken out of service, and neither should
 * be working orders. It is opt-in rather than automatic because a store's own
 * people must still be able to read and complete their profile while PENDING -
 * refusing that would make approval unreachable.
 */
export async function requireStoreAccess(
  userId: string,
  storeId: unknown,
  opts: { requireActive?: boolean; roles?: StoreRole[] } = {}
): Promise<StoreAccessResult> {
  if (!storeId || typeof storeId !== "string") {
    return { ok: false, status: 404, error: "Store not found" };
  }

  // One indexed lookup on the unique (storeId, userId) pair. Membership is
  // checked FIRST and the store is only read through it, so a non-member never
  // causes a Store row to be fetched at all.
  const membership = await prisma.storeMember.findUnique({
    where: { storeId_userId: { storeId, userId } },
    include: { store: true },
  });
  if (!membership) return { ok: false, status: 404, error: "Store not found" };

  if (opts.roles && !opts.roles.includes(membership.role as StoreRole)) {
    return { ok: false, status: 403, error: "You do not have permission to do that for this store" };
  }

  if (opts.requireActive && membership.store.status !== "ACTIVE") {
    return {
      ok: false,
      status: 403,
      error:
        membership.store.status === "SUSPENDED"
          ? "This store is suspended"
          : "This store is not approved yet",
    };
  }

  const { store, ...rest } = membership;
  return { ok: true, store, membership: rest as StoreMember };
}

/**
 * Every store this user may act for.
 *
 * Drives the "which store are you signing in as?" picker. Returns a list rather
 * than one store because StoreMember is deliberately many-to-many - one person
 * can run more than one branch - and a helper that returned a single store
 * would quietly pick an arbitrary one the first time that happened.
 */
export async function listStoresForUser(
  userId: string
): Promise<{ store: Store; role: StoreRole }[]> {
  const rows = await prisma.storeMember.findMany({
    where: { userId },
    include: { store: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ store: r.store, role: r.role as StoreRole }));
}
