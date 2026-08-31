/**
 * Who a delivery is offered to, and what happens when nobody takes it
 * (MART_INTEGRATION.md §6 D4).
 *
 * D4 was open until now. The answer taken: offer to couriers near the shop
 * first, widen the circle on a timer, and once it has waited long enough raise
 * it on the operations board for a person. No automatic fee increase - that is
 * a pricing decision with real cost exposure, it belongs to Blueprint §10 surge
 * pay, and none of that is built.
 *
 * THE RADIUS IS A PROPERTY OF THE POSTING, NOT A QUERY OVER COURIERS, and that
 * is the load-bearing decision in this file. PartTime stores no courier
 * location: `User.location` is free text and `CourierProfile` holds a vehicle
 * and a plate. There is nothing to run a "who is nearest" query against, and
 * inventing one would mean collecting and retaining live positions for every
 * rider - a standing privacy liability, a §5-shaped retention problem, and a
 * mobile release, all to answer a question that can be answered without any of
 * it. So the posting carries a circle that grows with time, and a courier
 * asking what they can claim says where they are in that request. The position
 * is used to answer and never written down.
 *
 * That also matches how this codebase already works: routes/clock.ts takes the
 * device's coordinates per request for the geofence, and routes/organizations.ts
 * measures the store map from a point supplied per request. This is the third
 * use of the same shape rather than a new one.
 *
 * EVERYTHING HERE IS DERIVED AT READ TIME. There is no timer, no queue and no
 * second cron. The radius at any moment is arithmetic on how long the order has
 * been waiting, which means it cannot drift, cannot be stale, and cannot stop
 * firing - the failure mode the delivery purge needs an audit row to make
 * visible does not exist for this. It is the same reason expired postings and
 * lapsed credentials are computed rather than swept.
 */
import { haversineMetres, isValidCoord } from "../util/geo";

/**
 * The knobs, all `rules.DELIVERY.*` per the convention in taskRules.ts.
 *
 * Deliberately NOT added to `TaskRule` there. Those five fields describe what
 * any generated task pays and who is qualified for it, and every kind of work
 * has an answer for each. A claim radius is meaningless for a remote media task
 * and would appear as a dead field on its admin rules card. Same key prefix,
 * separate concern.
 */
export interface OfferRule {
  /** Off disables self-claim entirely and the platform falls back to an admin
   *  approving an application, which is what it did before this existed. */
  selfClaim: boolean;
  /** How close a courier must be when the posting first goes up. */
  baseRadiusMetres: number;
  /** How long each doubling of the circle takes. */
  stepMinutes: number;
  /** Where the widening stops. Beyond a point "nearby" stops meaning anything
   *  and the honest answer is that nobody is coming, which is what escalation
   *  is for. */
  maxRadiusMetres: number;
  /** How long an unclaimed order waits before the operations board flags it. */
  escalateAfterMinutes: number;
}

/**
 * Defaults sized for a city motorcycle courier, not asserted as correct.
 *
 * 3 km is a few minutes' ride; doubling every 5 minutes reaches the 15 km cap
 * in 15 minutes; 20 minutes unclaimed is long enough that somebody should look
 * at it. Every one of these is a `Setting`, because the right numbers are an
 * operational fact nobody knows before the first week of real orders.
 */
export const DEFAULT_OFFER_RULE: OfferRule = {
  selfClaim: true,
  baseRadiusMetres: 3_000,
  stepMinutes: 5,
  maxRadiusMetres: 15_000,
  escalateAfterMinutes: 20,
};

const KEYS = {
  selfClaim: "rules.DELIVERY.selfClaim",
  baseRadiusMetres: "rules.DELIVERY.baseRadiusMetres",
  stepMinutes: "rules.DELIVERY.radiusStepMinutes",
  maxRadiusMetres: "rules.DELIVERY.maxRadiusMetres",
  escalateAfterMinutes: "rules.DELIVERY.escalateAfterMinutes",
} as const;

export const OFFER_SETTING_KEYS = Object.values(KEYS);

/**
 * The rule in force right now.
 *
 * `selfClaim` follows the `eligibility.enforce` precedent exactly: an absent row
 * means ON, and the literal string "off" is the only thing that disables it.
 * A kill-switch that needs a row to exist before it can be found is one nobody
 * finds at the moment they need it.
 */
export async function offerRule(p: any): Promise<OfferRule> {
  const rows = await p.setting.findMany({ where: { key: { in: OFFER_SETTING_KEYS } } });
  const set = new Map<string, string>(rows.map((r: any) => [r.key, String(r.value)]));

  const num = (key: string, fallback: number): number => {
    const raw = set.get(key);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    // A misconfigured number falls back rather than propagating. A radius of
    // NaN compares false against every distance, which would silently make
    // every delivery unclaimable and look exactly like an outage.
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const claim = set.get(KEYS.selfClaim);
  return {
    selfClaim: claim === undefined ? true : claim.toLowerCase() !== "off",
    baseRadiusMetres: num(KEYS.baseRadiusMetres, DEFAULT_OFFER_RULE.baseRadiusMetres),
    stepMinutes: num(KEYS.stepMinutes, DEFAULT_OFFER_RULE.stepMinutes),
    maxRadiusMetres: num(KEYS.maxRadiusMetres, DEFAULT_OFFER_RULE.maxRadiusMetres),
    escalateAfterMinutes: num(
      KEYS.escalateAfterMinutes,
      DEFAULT_OFFER_RULE.escalateAfterMinutes
    ),
  };
}

/**
 * How far along the escalation this order is.
 *
 * ESCALATED does NOT close the offer. It means a person should look, while the
 * job stays claimable by anyone in range - stopping couriers from taking an
 * order at the exact moment it is agreed nobody has taken it would be perverse.
 */
export type OfferStage = "OFFERED" | "WIDENED" | "ESCALATED";

export interface OfferState {
  stage: OfferStage;
  /** The circle right now, in metres. */
  radiusMetres: number;
  /** How long it has been on the board. */
  waitingMinutes: number;
  /** How many times the circle has doubled. */
  widenings: number;
  /** The circle has stopped growing; distance will not help this order. */
  atMaxRadius: boolean;
  /** Long enough that operations should see it. */
  escalated: boolean;
  /** Wording for people. The enum name tells a courier nothing. */
  label: string;
}

const MINUTE = 60_000;

/**
 * The offer as it stands at `now`.
 *
 * `offeredAt` null means the posting is not on the board - the store has not
 * accepted, or a courier already holds it. That is not the same as a circle of
 * zero, so it is refused rather than defaulted: a zero radius would render as a
 * live offer nobody on Earth is inside.
 */
export function offerStateAt(
  offeredAt: Date | null | undefined,
  now: Date,
  rule: OfferRule
): OfferState | null {
  if (!offeredAt) return null;

  const elapsed = Math.max(0, now.getTime() - offeredAt.getTime());
  const waitingMinutes = Math.floor(elapsed / MINUTE);

  // Doubling rather than adding, because a courier who is not in the first
  // circle is usually well outside it, and stepping out in equal increments
  // spends the whole escalation window covering ground nobody is standing on.
  const steps = Math.floor(elapsed / (rule.stepMinutes * MINUTE));
  const uncapped = rule.baseRadiusMetres * Math.pow(2, steps);
  const radiusMetres = Math.min(uncapped, rule.maxRadiusMetres);
  const atMaxRadius = uncapped >= rule.maxRadiusMetres;
  const widenings = Math.max(
    0,
    Math.round(Math.log2(radiusMetres / rule.baseRadiusMetres))
  );

  const escalated = waitingMinutes >= rule.escalateAfterMinutes;
  const stage: OfferStage = escalated ? "ESCALATED" : widenings > 0 ? "WIDENED" : "OFFERED";

  return {
    stage,
    radiusMetres,
    waitingMinutes,
    widenings,
    atMaxRadius,
    escalated,
    label: escalated
      ? `Unclaimed for ${waitingMinutes} min - needs a person`
      : widenings > 0
        ? `Offered ${waitingMinutes} min ago, circle widened`
        : "Offered to couriers nearby",
  };
}

/**
 * Whether this courier, standing here, may take this job.
 *
 * A POSTING WITH NO COORDINATES IS OPEN TO EVERYONE QUALIFIED, and that is
 * deliberate rather than an oversight. The pickup point is copied from the
 * store, and a real share of approved businesses have never had their position
 * set - the admin map counts them on its own screen. Refusing to let anyone
 * claim those would make every order from an un-located shop undeliverable
 * forever, discovered as orders quietly rotting on the board. An unknown
 * distance is not a failed distance check.
 */
export type ReachResult =
  | { inRange: true; distanceMetres: number | null; radiusMetres: number }
  | { inRange: false; distanceMetres: number; radiusMetres: number };

export function reach(
  pickup: { lat: number | null; lng: number | null },
  courier: { lat: unknown; lng: unknown },
  state: OfferState
): ReachResult {
  if (!isValidCoord(pickup.lat, pickup.lng)) {
    return { inRange: true, distanceMetres: null, radiusMetres: state.radiusMetres };
  }
  if (!isValidCoord(courier.lat, courier.lng)) {
    // The courier could not say where they are. Distinguished from being too
    // far away by the caller, because "turn your location on" and "you are too
    // far from this shop" are different problems with different fixes.
    return { inRange: false, distanceMetres: Infinity, radiusMetres: state.radiusMetres };
  }

  const distanceMetres = haversineMetres(
    Number(courier.lat),
    Number(courier.lng),
    pickup.lat as number,
    pickup.lng as number
  );
  return distanceMetres <= state.radiusMetres
    ? { inRange: true, distanceMetres, radiusMetres: state.radiusMetres }
    : { inRange: false, distanceMetres, radiusMetres: state.radiusMetres };
}

/**
 * When the circle will next reach this courier, in minutes, or null if it never
 * will.
 *
 * This is the difference between "you cannot have this" and "wait four minutes",
 * and a courier who is told the second will still be on the app when it comes
 * round. Null means they are outside even the maximum circle.
 */
export function minutesUntilInRange(
  distanceMetres: number,
  offeredAt: Date,
  now: Date,
  rule: OfferRule
): number | null {
  if (!Number.isFinite(distanceMetres)) return null;
  if (distanceMetres > rule.maxRadiusMetres) return null;

  const stepsNeeded = Math.max(
    0,
    Math.ceil(Math.log2(distanceMetres / rule.baseRadiusMetres))
  );
  const readyAt = offeredAt.getTime() + stepsNeeded * rule.stepMinutes * MINUTE;
  return Math.max(0, Math.ceil((readyAt - now.getTime()) / MINUTE));
}
