/**
 * Distance on the ground.
 *
 * Extracted from routes/clock.ts, where it was the geofence check, because the
 * store map needs the same arithmetic and two copies of a distance function is
 * how two parts of a dispatch system come to disagree about whether a courier is
 * near a shop.
 */

/** Great-circle distance in metres between two WGS-84 points (Haversine). */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A latitude/longitude pair that is actually on Earth. */
export function isValidCoord(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la < -90 || la > 90) return false;
  if (ln < -180 || ln > 180) return false;
  // 0,0 is in the Gulf of Guinea and is almost always a missing value that got
  // coerced rather than a real position. Rejecting it here stops one unset shop
  // appearing as the nearest node to half of Nigeria.
  if (la === 0 && ln === 0) return false;
  return true;
}

/** Metres as something a person reads: "800 m", "2.4 km". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
