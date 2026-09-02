import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

/**
 * A list that keeps itself current.
 *
 * WHY THIS EXISTS. Every screen in the portal fetched once on mount and then sat
 * there. A store props a tablet on the counter, AfriZoneMart sends an order, and
 * nothing happens until somebody thinks to reload — which is the whole product
 * failing silently, in the one place where the failure looks like "no orders
 * today". A courier watching for offers had the same problem.
 *
 * POLLING, NOT SOCKETS. The API is an Express app on a Worker with no socket
 * layer, and orders arrive at human speed — a shop gets a few an hour, not a few
 * a second. Twenty seconds of staleness is invisible to a person and costs one
 * cheap request; a socket would cost a new server capability, a reconnect story
 * and a deployment, to shave off seconds nobody is measuring.
 *
 * THREE RULES IT FOLLOWS, all of them about not being a nuisance:
 *
 * 1. It stops when nobody is looking. A backgrounded tab polls nothing, and
 *    fetches immediately when it comes back — so the first thing a shopkeeper
 *    sees on returning is current, not twenty seconds old.
 * 2. It backs off when the API is unhappy, doubling up to a cap. An outage
 *    should not turn every idle tab into a load generator, and the interesting
 *    case is a shop that leaves this open all day.
 * 3. It never reports a failed poll as an empty list. A refresh that fails
 *    leaves the last good data on screen and says so quietly, because blanking
 *    a counter screen on one dropped request is worse than showing a
 *    twenty-second-old order.
 */

const DEFAULT_INTERVAL = 20_000
/** Ceiling for the error backoff. Long enough to be polite, short enough that a
 *  shop that recovers is not left stale for minutes. */
const MAX_INTERVAL = 5 * 60_000

export interface Live<T> {
  data: T | null
  error: string | null
  /** True while a refresh is in flight AFTER the first successful load. The
   *  first load shows a loading state; later ones must not, or the screen
   *  flickers every twenty seconds. */
  refreshing: boolean
  /** When the last SUCCESSFUL load landed. Null until the first one. */
  updatedAt: Date | null
  /** True when the most recent attempt failed but older data is still shown. */
  stale: boolean
  refresh: () => void
}

export function useLive<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  intervalMs: number = DEFAULT_INTERVAL,
): Live<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [stale, setStale] = useState(false)

  // Held in refs, not state: changing the poll delay must not re-run the effect
  // that owns the timer, or a failing request reschedules itself on every
  // render.
  const delay = useRef(intervalMs)
  const loadRef = useRef(load)
  loadRef.current = load
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const hasData = useRef(false)

  const tick = useCallback(async () => {
    // One request at a time. A visibility change landing on top of a scheduled
    // poll would otherwise race, and the loser can arrive last and overwrite
    // the fresher answer.
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    if (hasData.current) setRefreshing(true)

    try {
      const next = await loadRef.current(ctrl.signal)
      if (!mounted.current || ctrl.signal.aborted) return
      setData(next)
      hasData.current = true
      setUpdatedAt(new Date())
      setError(null)
      setStale(false)
      delay.current = intervalMs
    } catch (e) {
      if (!mounted.current || ctrl.signal.aborted) return
      const message = e instanceof ApiError ? e.message : 'Could not reach Afrizone.'
      // Only the FIRST failure is an error state. After that there is data on
      // screen and the honest description is "stale", not "broken".
      if (hasData.current) setStale(true)
      else setError(message)
      delay.current = Math.min(delay.current * 2, MAX_INTERVAL)
    } finally {
      if (mounted.current && !ctrl.signal.aborted) setRefreshing(false)
    }
  }, [intervalMs])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      if (!document.hidden) await tick()
      if (mounted.current) schedule()
    }, delay.current)
  }, [tick])

  const refresh = useCallback(() => {
    void tick().then(() => {
      if (mounted.current) schedule()
    })
  }, [tick, schedule])

  useEffect(() => {
    mounted.current = true
    hasData.current = false
    delay.current = intervalMs
    setData(null)
    setUpdatedAt(null)
    setStale(false)
    void tick()
    schedule()

    // Coming back to the tab is the moment staleness matters most, so it fetches
    // then rather than waiting out the remainder of a timer that was running
    // while nobody could see it.
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (timer.current) clearTimeout(timer.current)
      inFlight.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, refreshing, updatedAt, stale, refresh }
}

/**
 * Which ids are new since the last time this component saw the list.
 *
 * A list that silently grows is nearly as bad as one that never updates: the
 * order appears somewhere in the middle and the shopkeeper, who was not
 * watching, has no way to tell it apart from the ones they already decided
 * about. This marks them instead.
 *
 * The FIRST load marks nothing. Everything is new the moment a screen opens,
 * and flagging all of it would train people to ignore the flag.
 */
export function useArrivals(ids: string[]): Set<string> {
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(ids)
      return
    }
    const added = ids.filter((id) => !seen.current!.has(id))
    if (added.length > 0) {
      setFresh((cur) => new Set([...cur, ...added]))
      for (const id of added) seen.current!.add(id)
    }
    // Ids that went away must be forgotten, or an order that is cancelled and
    // re-opened under the same id never reads as new again.
    for (const id of [...seen.current]) if (!ids.includes(id)) seen.current.delete(id)
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return fresh
}

/**
 * A local edit that survives until the poll catches up with it, and no longer.
 *
 * Accepting an order answers with the new row, but the next poll can be twenty
 * seconds away, so without this the card snaps back to RECEIVED under the
 * shopkeeper's hand. The naive fix - keep the local copy forever - is worse: it
 * masks every later change to that order, so a delivery the courier has since
 * collected still reads as "packing" on the store's screen, permanently.
 *
 * So each edit remembers WHEN it was made, and is dropped as soon as a
 * successful poll lands afterwards. A poll that completed after the edit
 * necessarily saw it, because the server had already committed it before it
 * answered the write.
 */
export function useOverlay<T extends { id: string }>(
  live: Live<T[]>,
): [T[] | null, (next: T) => void] {
  const [edits, setEdits] = useState<Record<string, { row: T; at: number }>>({})

  const landed = live.updatedAt ? live.updatedAt.getTime() : 0
  useEffect(() => {
    setEdits((cur) => {
      const kept = Object.entries(cur).filter(([, e]) => e.at > landed)
      return kept.length === Object.keys(cur).length ? cur : Object.fromEntries(kept)
    })
  }, [landed])

  const merged = live.data ? live.data.map((row) => edits[row.id]?.row ?? row) : null
  const replace = useCallback((next: T) => {
    setEdits((cur) => ({ ...cur, [next.id]: { row: next, at: Date.now() } }))
  }, [])

  return [merged, replace]
}
