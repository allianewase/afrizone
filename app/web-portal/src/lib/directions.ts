/**
 * Sending a courier to a place, from the portal.
 *
 * The same decision as the mobile app's `src/lib/directions.ts`, deliberately
 * duplicated: the two are separate builds with no shared package, and a
 * fourteen-line function is not worth inventing one for. If a third copy ever
 * appears, that is the moment to extract it.
 *
 * WHY A LINK AND NOT AN EMBEDDED MAP. A courier was given an address and left to
 * find the door. An embedded map would show a pin; what a rider needs is to be
 * taken there, by an app that knows the traffic and has their offline tiles.
 * Every courier already has one. This costs no map SDK, no API key, and no
 * billing account.
 *
 * AND THIS IS THE HALF THAT MATTERS TODAY. `app/mobile` ships nowhere until an
 * EAS build is made, so the portal is where a real courier actually works. The
 * app got the same treatment for when it eventually lands.
 */

export interface Place {
  lat?: number | null
  lng?: number | null
  address?: string | null
}

/**
 * Coordinates beat the address string.
 *
 * A delivery's pickup address is copied from the store when the order lands, so
 * it can be stale, or a landmark, or "shop 4, back of the plaza" - text a
 * geocoder places approximately or not at all. The coordinates came off a map.
 */
function target(p: Place): string | null {
  if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    return `${p.lat},${p.lng}`
  }
  const address = p.address?.trim()
  return address ? address : null
}

/** Turn-by-turn to it. Null when there is nowhere to point - render nothing. */
export function directionsUrl(p: Place): string | null {
  const to = target(p)
  return to ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}` : null
}

/** Just show where it is, for somewhere nobody has committed to going yet. */
export function placeUrl(p: Place): string | null {
  const to = target(p)
  return to ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(to)}` : null
}
