/**
 * Row-level access control for organizations - stores and courier companies.
 *
 * The role check is the easy half of RBAC and it is not what protects a
 * business. "Is this caller a store account?" is answered by requireAccountType
 * in auth.ts; "may this caller see THIS store's orders?" cannot be, because
 * every store account gives the same answer. That second question is ownership,
 * and it has to be asked per row, on the server, on every request that names an
 * organization.
 *
 * Shaped exactly like util/assignment.ts's requireAssignedTask(), which exists
 * because two endpoints took a bare taskId from the request body and looked it
 * up by id alone - so any authenticated worker could bill hours against a task
 * they had never been given. An organizationId taken from a path parameter is
 * the same hole with a different noun, and this is the same answer.
 *
 * Returned as a result object rather than thrown or written as middleware, for
 * two reasons. Middleware cannot see an organizationId that arrives in a body
 * rather than a path. And routes/tasks.ts already carries the lesson that
 * router-level guards are the wrong granularity here: mounting one on the router
 * would have caught GET / and GET /:id, which must stay open to workers.
 *
 * Nothing here branches on `kind`. A store and a courier company are the same
 * shape as far as membership, approval and payout are concerned - what differs
 * is the work they receive, which lives in the routes. The moment this file
 * grows an `if (kind === ...)` is the moment to ask whether the shared model was
 * still the right call.
 */
import type { Organization, OrganizationMember } from "@prisma/client";
import { prisma } from "../prisma";

/** STORE fulfils orders; COURIER delivers them. */
export type OrgKind = "STORE" | "COURIER";
export const ORG_KINDS: OrgKind[] = ["STORE", "COURIER"];

/** Standing within one organization. Not User.role, and not User.accountType. */
export type OrgRole = "OWNER" | "STAFF";
export const ORG_ROLES: OrgRole[] = ["OWNER", "STAFF"];

/** PENDING until Afrizone approves it; SUSPENDED takes it back out of service. */
export type OrgStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
export const ORG_STATUSES: OrgStatus[] = ["PENDING", "ACTIVE", "SUSPENDED"];

/** What a business is called when we have to say it to a person. */
export function kindLabel(kind: string): string {
  return kind === "COURIER" ? "courier company" : "store";
}

export type OrgAccessResult =
  | { ok: true; org: Organization; membership: OrganizationMember }
  | { ok: false; status: 403 | 404; error: string };

/**
 * May this user act for this organization?
 *
 * A caller who is not a member gets 404, not 403. 403 confirms the organization
 * exists and that the caller merely lacks access, which turns this endpoint into
 * a directory of every business on the platform for anyone willing to enumerate
 * ids. A non-member has no business learning the difference between "not yours"
 * and "not real".
 *
 * `requireActive` gates on the organization's own status: a PENDING one has not
 * been approved and a SUSPENDED one has been taken out of service, and neither
 * should be working orders. It is opt-in rather than automatic because a
 * business's own people must still be able to read and complete their profile
 * while PENDING - refusing that would make approval unreachable.
 */
export async function requireOrgAccess(
  userId: string,
  organizationId: unknown,
  opts: { requireActive?: boolean; roles?: OrgRole[]; kind?: OrgKind } = {}
): Promise<OrgAccessResult> {
  if (!organizationId || typeof organizationId !== "string") {
    return { ok: false, status: 404, error: "Not found" };
  }

  // One indexed lookup on the unique (organizationId, userId) pair. Membership
  // is checked FIRST and the organization is only read through it, so a
  // non-member never causes an Organization row to be fetched at all.
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
  if (!membership) return { ok: false, status: 404, error: "Not found" };

  // A store id handed to a courier route is not a permission problem, it is the
  // wrong object - so it answers 404 like any other thing this caller cannot
  // address, rather than confirming what kind of business it found.
  if (opts.kind && membership.organization.kind !== opts.kind) {
    return { ok: false, status: 404, error: "Not found" };
  }

  if (opts.roles && !opts.roles.includes(membership.role as OrgRole)) {
    return { ok: false, status: 403, error: "You do not have permission to do that here" };
  }

  if (opts.requireActive && membership.organization.status !== "ACTIVE") {
    const what = kindLabel(membership.organization.kind);
    return {
      ok: false,
      status: 403,
      error:
        membership.organization.status === "SUSPENDED"
          ? `This ${what} is suspended`
          : `This ${what} is not approved yet`,
    };
  }

  const { organization, ...rest } = membership;
  return { ok: true, org: organization, membership: rest as OrganizationMember };
}

/**
 * Every organization this user may act for, optionally of one kind.
 *
 * Drives the "which store are you signing in as?" picker. Returns a list rather
 * than one, because OrganizationMember is deliberately many-to-many - one person
 * can run more than one branch, and a rider can work for two companies - and a
 * helper that returned a single row would quietly pick an arbitrary one the
 * first time that happened.
 */
export async function listOrganizationsForUser(
  userId: string,
  kind?: OrgKind
): Promise<{ org: Organization; role: OrgRole }[]> {
  const rows = await prisma.organizationMember.findMany({
    where: { userId, ...(kind ? { organization: { kind } } : {}) },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ org: r.organization, role: r.role as OrgRole }));
}
