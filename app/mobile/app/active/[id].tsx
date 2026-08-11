import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Banner, LoadingState } from '../../src/components/Feedback';
import { ClockInButton, GeofenceState } from '../../src/components/ClockInButton';
import { TierBadge } from '../../src/components/TierBadge';
import { Icon } from '../../src/components/Icon';
import { colors, spacing, type, radii } from '../../src/theme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { formatElapsed, payLabel, formatDate } from '../../src/lib/format';
import type { Task, Timesheet } from '../../src/api/types';

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ActiveTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Task context: fetched once on mount for the header card.
  const taskQ = useAsync<Task | null>(
    (signal) => (id ? api.task(id, signal) : Promise.resolve(null)),
    [id]
  );
  const t = taskQ.data;

  const [clockedIn, setClockedIn] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [geofence, setGeofence] = useState<GeofenceState>('syncing');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startedAt = useRef<number | null>(null);
  const periodStart = useRef<string | null>(null);
  const workerCoords = useRef<{ lat: number; lng: number } | null>(null);

  // Resume clock state and check for a prior submitted timesheet on mount.
  useEffect(() => {
    if (!id) return;
    let active = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const [s, sheets] = await Promise.all([
          api.clockState(id, ctrl.signal),
          api.myTimesheets(ctrl.signal),
        ]);
        if (!active) return;
        if (s.clockedIn) {
          startedAt.current = Date.now() - s.elapsedSeconds * 1000;
          periodStart.current = s.lastEventAt ?? new Date(startedAt.current).toISOString();
          setElapsed(s.elapsedSeconds);
          setClockedIn(true);
        }
        // Show submitted state if a timesheet already exists for this task.
        const prior = sheets.find(
          (ts: Timesheet) => ts.taskId === id && (ts.status === 'SUBMITTED' || ts.status === 'APPROVED')
        );
        if (prior) setSubmitted(true);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    })();
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [id]);

  // GPS geofence check: starts once task data loads.
  useEffect(() => {
    if (!t) return;
    if (t.locationType === 'REMOTE' || t.lat == null || t.lng == null) {
      setGeofence('in-fence');
      return;
    }
    const taskLat = t.lat;
    const taskLng = t.lng;
    const radius = t.geofenceRadius ?? 100;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGeofence('out-of-fence');
        return;
      }
      setGeofence('syncing');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          workerCoords.current = { lat: latitude, lng: longitude };
          const dist = haversineMetres(latitude, longitude, taskLat, taskLng);
          setGeofence(dist <= radius ? 'in-fence' : 'out-of-fence');
        }
      );
    })();

    return () => { sub?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, t?.locationType, t?.lat, t?.lng, t?.geofenceRadius]);

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
    const clockType = clockedIn ? 'OUT' : 'IN';
    try {
      const res = await api.clock({
        taskId: id,
        type: clockType,
        lat: workerCoords.current?.lat ?? null,
        lng: workerCoords.current?.lng ?? null,
      });
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

  const remote = t?.locationType === 'REMOTE';
  const pay = t
    ? payLabel(t.payModel, t.payModel === 'HOURLY' ? t.rate : t.budget)
    : null;

  return (
    <Screen title={t?.title ?? 'Active task'} back scroll>
      {error ? (
        <Banner tone="danger" icon="alert" title="Something went wrong" message={error} />
      ) : null}

      {/* Task context card */}
      {taskQ.loading && !t ? (
        <View style={{ marginTop: spacing.lg }}>
          <LoadingState />
        </View>
      ) : t ? (
        <Card style={styles.contextCard}>
          <View style={styles.contextTop}>
            <TierBadge tier={t.tier} small />
            <Text style={styles.category}>{t.category}</Text>
          </View>

          <View style={styles.contextMeta}>
            {/* Pay */}
            <View style={styles.metaItem}>
              <Icon name="wallet" size={14} color={colors.money} />
              <Text style={[styles.metaText, { color: colors.moneyInk, fontWeight: '700' }]}>
                {pay}
              </Text>
            </View>

            {/* Location */}
            <View style={styles.metaDot} />
            <View style={styles.metaItem}>
              <Icon name={remote ? 'globe' : 'map-pin'} size={14} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {remote ? 'Remote' : (t.address ?? 'Physical')}
              </Text>
            </View>
          </View>

          {/* Shift dates */}
          {(t.startDate || t.endDate) ? (
            <View style={styles.metaItem}>
              <Icon name="clock" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>
                {t.startDate ? formatDate(t.startDate) : ''}
                {t.startDate && t.endDate ? ' – ' : ''}
                {t.endDate ? formatDate(t.endDate) : ''}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Timer */}
      <View style={styles.timerWrap}>
        <Text style={styles.timerLabel}>{clockedIn ? 'On the clock' : 'Elapsed today'}</Text>
        <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
        {clockedIn ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        ) : null}
      </View>

      {/* Clock button */}
      <View style={styles.clock}>
        <ClockInButton
          clockedIn={clockedIn}
          geofence={geofence}
          busy={busy}
          onToggle={toggleClock}
        />
      </View>

      {/* Timesheet submission */}
      {submitted ? (
        <Banner
          tone="money"
          icon="check-circle"
          title="Timesheet submitted"
          message="Awaiting approval: check status in Profile › Timesheets."
        />
      ) : (
        <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
          <Button
            label="Submit timesheet"
            variant="secondary"
            icon="check"
            onPress={submitTimesheet}
            disabled={clockedIn || elapsed === 0 || busy}
          />
          {clockedIn ? (
            <Text style={styles.hint}>Clock out before submitting your hours.</Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contextCard: { gap: spacing.sm, marginTop: spacing.md },
  contextTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  category: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '700' },
  contextMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 99,
    backgroundColor: colors.line,
  },
  metaText: { color: colors.textMuted, fontSize: type.size.sm },
  timerWrap: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.xs },
  timerLabel: { color: colors.textMuted, fontSize: type.size.base, fontWeight: '600' },
  timer: {
    color: colors.text,
    fontSize: 56,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.moneySoft,
    borderRadius: 99,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.xs,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.money,
  },
  liveText: { color: colors.moneyInk, fontSize: type.size.sm, fontWeight: '700' },
  clock: { alignItems: 'center', marginTop: spacing.xl },
  hint: { color: colors.textMuted, fontSize: type.size.sm, textAlign: 'center' },
});
