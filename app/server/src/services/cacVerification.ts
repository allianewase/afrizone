/**
 * CAC registration checks for stores (Blueprint §15).
 *
 * The Corporate Affairs Commission is Nigeria's company registry. This module
 * owns two things: what counts as a well-formed registration number, and what
 * happens when one is submitted.
 *
 * ENV-GATED, THE SAME WAY SMILE IDENTITY IS. With no provider configured the
 * submission lands in a review queue and a human decides - which is the
 * behaviour today and is not a degraded mode. With one configured, the lookup
 * runs first and its answer is attached to the same review. A provider that
 * cannot be reached must never block a store from registering: PENDING is a
 * queue somebody works, an error is a shop that cannot sign up.
 *
 * NOTHING HERE AUTO-REJECTS. The registry's answer informs a person; it does not
 * replace them. A name that differs from the trading name is the normal case for
 * a Nigerian business - "Mama Nkechi Provisions" trading as "M. NKECHI
 * PROVISIONS LTD" - and refusing on a string comparison would turn the common
 * case into a rejection.
 */
import { prisma } from "../prisma";
import { writeAudit, type AuditActor } from "../util/audit";

export type CacStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
export const CAC_STATUSES: CacStatus[] = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"];

/**
 * Read lazily, not at module load. Workers only populate process.env from
 * bindings once request handling begins; reading eagerly sees them unset
 * permanently. Same pattern as paystack.ts and smileIdentity.ts.
 */
function config() {
  return {
    url: process.env.CAC_LOOKUP_URL || "",
    apiKey: process.env.CAC_API_KEY || "",
  };
}

export function isCacConfigured(): boolean {
  const { url, apiKey } = config();
  return !!(url && apiKey);
}

/**
 * Normalise a registration number for storage and comparison.
 *
 * Registry numbers are written every way a human can write them - "RC 123456",
 * "rc-123456", "123456". Storing them verbatim means the same company registers
 * twice and the unique index never notices, which is the whole reason to
 * normalise rather than merely trim.
 */
export function normaliseCac(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Well-formed enough to look up.
 *
 * DELIBERATELY PERMISSIVE. CAC issues RC numbers for companies, BN for business
 * names and IT for incorporated trustees, the digits have grown over the years,
 * and the registry is the authority on what exists - not a regular expression
 * written here. Anything that is plainly not a registration number is refused;
 * everything else is passed on to be checked. A wrong refusal at this line stops
 * a legitimate business signing up and produces no evidence of why.
 */
export function isPlausibleCac(normalised: string): boolean {
  if (normalised.length < 4 || normalised.length > 20) return false;
  // Must contain at least one digit: registry numbers are numeric with an
  // optional letter prefix, and a purely alphabetic string is a company name
  // typed into the wrong field.
  return /\d/.test(normalised);
}

export interface CacLookup {
  found: boolean;
  /** The registered name, when the registry returned one. */
  name?: string;
  status?: string;
  raw?: unknown;
  /** Set when the lookup could not be completed at all. */
  error?: string;
}

/**
 * Ask the registry about a number.
 *
 * Returns `error` rather than throwing for an unreachable provider, because
 * every caller has the same correct response to that - carry on and let a person
 * decide - and an exception would make each of them remember to.
 */
export async function lookupCac(normalised: string): Promise<CacLookup> {
  const { url, apiKey } = config();
  if (!url || !apiKey) return { found: false, error: "No provider configured" };

  try {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}rcNumber=${encodeURIComponent(normalised)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      // A registry lookup that hangs must not hold a registration open.
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { found: false };
    if (!res.ok) return { found: false, error: `Registry returned ${res.status}` };

    const body: any = await res.json();
    // Providers wrap the payload differently; the two shapes seen in the wild
    // are the record at the top level or under `data`.
    const record = body?.data ?? body;
    const name = record?.companyName ?? record?.name ?? record?.approvedName;
    return {
      found: !!name,
      name: name ? String(name) : undefined,
      status: record?.status ? String(record.status) : undefined,
      raw: body,
    };
  } catch (e) {
    return { found: false, error: e instanceof Error ? e.message : "Lookup failed" };
  }
}

/**
 * Loose comparison of a trading name against a registered one.
 *
 * Only ever used to decide whether to SHOW the reviewer a warning. It is not a
 * gate, and it is not trying to be clever: it strips the legal-form words that
 * differ by definition between the two, and asks whether either contains the
 * other.
 */
export function namesLookAlike(trading: string, registered: string): boolean {
  const strip = (s: string) =>
    s
      .toUpperCase()
      .replace(/\b(LIMITED|LTD|PLC|ENTERPRISES|ENTERPRISE|NIG|NIGERIA|COMPANY|CO|AND|&)\b/g, "")
      .replace(/[^A-Z0-9]/g, "");
  const a = strip(trading);
  const b = strip(registered);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export interface SubmitResult {
  ok: true;
  status: CacStatus;
  /** What to tell the submitter. The server writes this copy, never the client. */
  message: string;
  registeredName: string | null;
  mismatch: boolean;
}
export interface SubmitFailure {
  ok: false;
  status: number;
  error: string;
}

/**
 * Record a registration number against a business and check it if we can.
 *
 * ALWAYS LANDS ON PENDING, never on VERIFIED. Even a registry hit that matches
 * the name exactly goes to a person, because the question being answered is not
 * "does this company exist" but "is this the company applying" - and only the
 * second one is worth money. The lookup makes that decision quick, not
 * automatic.
 */
export async function submitCac(
  organizationId: string,
  rawNumber: string,
  actor: AuditActor
): Promise<SubmitResult | SubmitFailure> {
  const normalised = normaliseCac(rawNumber);
  if (!isPlausibleCac(normalised)) {
    return { ok: false, status: 400, error: "That does not look like a CAC registration number" };
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { ok: false, status: 404, error: "Not found" };

  // Checked before writing rather than caught afterwards, so the refusal can say
  // what is actually wrong. A unique-constraint error surfaces as a 500 with no
  // usable message, and "already registered to another business" is exactly the
  // thing somebody needs to hear.
  const clash = await prisma.organization.findFirst({
    where: { cacNumber: normalised, NOT: { id: organizationId } },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false,
      status: 409,
      error: "That registration number is already recorded against another business",
    };
  }

  const lookup = isCacConfigured() ? await lookupCac(normalised) : { found: false, error: "No provider configured" };
  const registeredName = lookup.name ?? null;
  const mismatch = !!registeredName && !namesLookAlike(org.name, registeredName);

  const note = lookup.error
    ? `Submitted. Registry not consulted: ${lookup.error}`
    : lookup.found
      ? mismatch
        ? `Registry returned "${registeredName}", which does not obviously match "${org.name}" - worth checking`
        : `Registry returned "${registeredName}"`
      : "Registry has no record of this number";

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      cacNumber: normalised,
      cacStatus: "PENDING",
      cacName: registeredName,
      cacCheckedAt: new Date(),
      cacNote: note,
    },
  });

  await writeAudit(actor, "organization.cac.submitted", "Organization", org.id, {
    cacNumber: normalised,
    registryConsulted: !lookup.error,
    found: lookup.found,
    mismatch,
  });

  return {
    ok: true,
    status: "PENDING",
    message: "Registration number recorded. Afrizone will confirm it.",
    registeredName,
    mismatch,
  };
}

/**
 * An admin's verdict. The only path to VERIFIED or REJECTED.
 *
 * A rejection REQUIRES a note. "Rejected" with no reason is a store that
 * resubmits the same number, and a queue that grows.
 */
export async function decideCac(
  organizationId: string,
  decision: "VERIFIED" | "REJECTED",
  note: string | null,
  actor: AuditActor
): Promise<SubmitResult | SubmitFailure> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { ok: false, status: 404, error: "Not found" };
  if (!org.cacNumber) {
    return { ok: false, status: 400, error: "This business has not supplied a registration number" };
  }
  if (decision === "REJECTED" && !note?.trim()) {
    return { ok: false, status: 400, error: "Say why it was rejected" };
  }

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      cacStatus: decision,
      cacCheckedAt: new Date(),
      cacNote: note?.trim() || org.cacNote,
    },
  });

  await writeAudit(actor, "organization.cac.decided", "Organization", org.id, {
    from: org.cacStatus,
    to: decision,
    cacNumber: org.cacNumber,
  });

  return {
    ok: true,
    status: decision,
    message: decision === "VERIFIED" ? "Registration confirmed" : "Registration rejected",
    registeredName: updated.cacName,
    mismatch: false,
  };
}
