import { Linking } from 'react-native';

/**
 * Sending a rider to a place.
 *
 * WHY THIS HANDS OFF INSTEAD OF DRAWING A MAP. The gap this closes is that a
 * courier was given an address and a phone number and left to find the door.
 * The obvious fix is to embed a map, and it is the wrong one: an embedded map
 * shows a pin. A rider does not need to be shown where the door is, they need to
 * be taken there - with live traffic, a route that knows about the one-way
 * system, voice guidance while their phone is in a cradle, and the offline tiles
 * they already downloaded. That is a navigation app, and every courier already
 * has one and trusts it more than ours.
 *
 * So this costs no native module, no Google Maps API key, no config plugin and
 * no new permission, and it is also the better product. An embedded map is still
 * worth having one day for at-a-glance context in a list - "how far out is this
 * job" - but that is a different job from finding a door, and it is not what was
 * missing.
 *
 * The universal `google.com/maps` URLs below open the Google Maps app when it is
 * installed on either platform and fall back to the browser when it is not, so
 * there is nothing to detect. Apple Maps is not special-cased: Nigerian street
 * data is Google's strength, and a rider sent to the wrong side of Ikeja by the
 * more elegant integration is not better served.
 */

export interface Place {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

/**
 * Coordinates win over the address string, always.
 *
 * A delivery's pickup address is COPIED from the store at the moment the order
 * lands, so it can be an old address, a landmark, or "shop 4, back of the
 * plaza" - text a geocoder will place approximately or not at all. The
 * coordinates came off a map. Where both exist they describe the same place and
 * only one of them is exact.
 */
function target(p: Place): string | null {
  if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    return `${p.lat},${p.lng}`;
  }
  const address = p.address?.trim();
  return address ? address : null;
}

/** Whether there is anywhere to send them. Render no button when there is not. */
export function canPoint(p: Place | null | undefined): boolean {
  return !!p && target(p) !== null;
}

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    // Rare, but real: a device with no browser and no maps app, or a locked-down
    // work profile. The caller says so rather than leaving a button that looks
    // broken - a rider who taps twice and gets nothing assumes the job is wrong,
    // not the phone.
    return false;
  }
}

/** Take them there. Turn-by-turn, from wherever they are standing. */
export function openDirections(p: Place): Promise<boolean> {
  const to = target(p);
  if (!to) return Promise.resolve(false);
  return open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}`);
}

/**
 * Just show them where it is.
 *
 * For a job they have not taken yet. Opening turn-by-turn navigation for a
 * delivery somebody is only considering would start a route they did not ask
 * for, and on Android it can hand the phone to a full-screen guidance view -
 * which is a hostile answer to "where is this, roughly?".
 */
export function openPlace(p: Place): Promise<boolean> {
  const to = target(p);
  if (!to) return Promise.resolve(false);
  return open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(to)}`);
}

/**
 * What to call the button.
 *
 * Named for the destination, not the mechanism: "Navigate" tells a rider
 * holding two addresses nothing about which of them they are about to be sent
 * to, and picking the wrong one mid-job costs a street.
 */
export const directionsLabel = {
  shop: 'Directions to the shop',
  door: 'Directions to the door',
  site: 'Get directions',
} as const;
