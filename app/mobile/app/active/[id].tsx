import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Feedback';
import { ClockInButton, GeofenceState } from '../../src/components/ClockInButton';
import { colors, spacing, type } from '../../src/theme';
import { api, ApiError } from '../../src/api/client';
import { formatElapsed } from '../../src/lib/format';

/**
 * Active-task screen (§5). Clock in/out + elapsed timer.
 * REAL endpoints (API_CONTRACT v3):
 *   - POST /api/clock {taskId, type:"IN"|"OUT", lat?, lng?}
 *   - GET  /api/me/clock/:taskId  (resume state on mount)
 *   - POST /api/timesheets {taskId, periodStart, periodEnd, hours}
 */
export default function ActiveTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [clockedIn, setClockedIn] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [geofence, setGeofence] = useState<GeofenceState>('syncing');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Wall-clock anchor: now - elapsedSeconds, so the timer survives resume.
  const startedAt = useRef<number | null>(null);
  // Period start for the timesheet (first clock-in this session, or resumed).
  const periodStart = useRef<string | null>(null);

  // Resume state on mount: GET /api/me/clock/:taskId.
  useEffect(() => {
    if (!id) return;
    let active = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const s = await api.clockState(id, ctrl.signal);
        if (!active) return;
        setGeofence('in-fence');
        if (s.clockedIn) {
          startedAt.current = Date.now() - s.elapsedSeconds * 1000;
          periodStart.current = s.lastEventAt ?? new Date(startedAt.current).toISOString();
          setElapsed(s.elapsedSeconds);
          setClockedIn(true);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (active) setGeofence('in-fence');
      }
    })();
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [id]);

  // Elapsed timer ticks while clocked in.
  useEffect(() => {
    if (!clockedIn) return;
    const iv = setInterval(() => {
      if (startedAt.current) {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [clockedIn]);

  async function toggleClock() {
    if (!id) return;
    setBusy(true);
    setError(null);
    const type = clockedIn ? 'OUT' : 'IN';
    try {
      // REAL: POST /api/clock — coords omitted (treated as in-fence by the demo backend).
      const res = await api.clock({ taskId: id, type });
      if (res.clockedIn) {
        startedAt.current = Date.now() - res.elapsedSeconds * 1000;
        if (!periodStart.current) periodStart.current = res.event.createdAt;
        setElapsed(res.elapsedSeconds);
        setClockedIn(true);
      } else {
        setClockedIn(false);
        setElapsed(res.elapsedSeconds);
      }
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Could not record clock event.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function submitTimesheet() {
    if (!id) return;
    setBusy(true);
    setError(null);
    const hours = Math.max(0.01, elapsed / 3600);
    const end = new Date().toISOString();
    const start = periodStart.current ?? new Date(Date.now() - elapsed * 1000).toISOString();
    try {
      // REAL: POST /api/timesheets
      await api.submitTimesheet({
        taskId: id,
        periodStart: start,
        periodEnd: end,
        hours: Number(hours.toFixed(2)),
      });
      setSubmitted(true);
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Could not submit timesheet.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Active task" back scroll>
      {error ? (
        <Banner tone="danger" icon="alert" title="Something went wrong" message={error} />
      ) : null}

      <View style={styles.timerWrap}>
        <Text style={styles.timerLabel}>{clockedIn ? 'On the clock' : 'Elapsed today'}</Text>
        <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
      </View>

      <View style={styles.clock}>
        <ClockInButton
          clockedIn={clockedIn}
          geofence={geofence}
          busy={busy}
          onToggle={toggleClock}
        />
      </View>

      {submitted ? (
        <Banner tone="money" icon="check-circle" title="Timesheet submitted" message="Awaiting approval — you’ll be paid once approved." />
      ) : (
        <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
          <Button
            label="Submit timesheet"
            variant="secondary"
            icon="check"
            onPress={submitTimesheet}
            disabled={clockedIn || elapsed === 0 || busy}
          />
          {clockedIn ? <Text style={styles.hint}>Clock out before submitting your hours.</Text> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  timerWrap: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.xs },
  timerLabel: { color: colors.textMuted, fontSize: type.size.base, fontWeight: '600' },
  timer: { color: colors.text, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clock: { alignItems: 'center', marginTop: spacing.xl },
  hint: { color: colors.textMuted, fontSize: type.size.sm, textAlign: 'center' },
});
