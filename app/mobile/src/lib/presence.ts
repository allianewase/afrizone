/**
 * Going online for ranked delivery offers (server: services/ranking.ts).
 *
 * A courier who is online is offered orders first when they are among the
 * best-placed riders for the shop. That needs the server to know roughly where
 * they are before they ask, so while they are online the app sends their
 * position every few minutes. Only the latest point is kept, and going offline
 * deletes it.
 *
 * THE HEARTBEAT RUNS WHILE THE APP IS OPEN, ANYWHERE IN IT. Not only on the
 * Deliveries screen - a rider checking their wallet is still available - but
 * not in the background either: that would need background location, a
 * permission most people refuse and Android flags loudly. So a courier who puts
 * the app away stops being ranked after the server's timeout (30 minutes), and
 * nothing has to remember to switch them off.
 *
 * ONE SHARED FLAG, NOT PER-SCREEN STATE. The Deliveries toggle and the
 * heartbeat in the root layout must agree about whether this courier is online,
 * and a module-level store is the smallest thing that lets them.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { api } from '../api/client';

/** Well inside the server's 30-minute timeout, so one missed beat costs nothing. */
const HEARTBEAT_MS = 3 * 60_000;

type Listener = () => void;
let online: boolean | null = null; // null: not yet asked the server
const listeners = new Set<Listener>();

function setOnline(next: boolean | null) {
  online = next;
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether this courier is online, as the app last heard from the server. */
export function usePresence(): boolean | null {
  return useSyncExternalStore(subscribe, () => online);
}

/** Where the phone is now, or null if location is refused or unavailable. */
async function here(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Go online. Throws with the server's sentence (or ours, for a refused
 * location) so the toggle can show it - a switch that silently stays off is
 * the worst version of this.
 */
export async function goOnline(): Promise<void> {
  const at = await here();
  if (!at) {
    throw new Error('Turn on location to go online. Orders go first to the couriers nearest the shop.');
  }
  const res = await api.goOnline(at);
  setOnline(res.online);
}

export async function goOffline(): Promise<void> {
  const res = await api.goOffline();
  setOnline(res.online);
}

/** Ask the server, rather than trusting what this phone last believed. */
export async function refreshPresence(): Promise<void> {
  try {
    const res = await api.presence();
    setOnline(res.online);
  } catch {
    // Signed out, or no network. Leave the last known answer.
  }
}

/** Forget on sign-out, so the next account does not inherit it. */
export function resetPresence() {
  setOnline(null);
}

/**
 * Mount once, at the root, for a signed-in courier. Sends a heartbeat on a
 * timer and whenever the app comes back to the foreground, while online.
 */
export function usePresenceHeartbeat(enabled: boolean) {
  const isOnline = usePresence();

  // Learn the server's answer once per session.
  useEffect(() => {
    if (!enabled) {
      resetPresence();
      return;
    }
    void refreshPresence();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isOnline) return;

    let stopped = false;
    async function beat() {
      if (stopped || AppState.currentState !== 'active') return;
      const at = await here();
      if (!at || stopped) return;
      try {
        const res = await api.goOnline(at);
        setOnline(res.online);
      } catch {
        // A missed beat is fine - the server's timeout is ten of these.
      }
    }

    void beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void beat();
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, isOnline]);
}
