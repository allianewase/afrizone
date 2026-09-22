import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { AppBackHeader, AppPrimaryButton, AppLoadingCards } from '../../src/appui/AppUI';
import { Banner } from '../../src/components/Feedback';
import { ClockInButton, GeofenceState } from '../../src/components/ClockInButton';
import { Icon } from '../../src/components/Icon';
import { obColors, obRadii } from '../../src/onboarding/onboardingTheme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { formatElapsed, payLabel, formatDate } from '../../src/lib/format';
import type { Task, Timesheet } from '../../src/api/types';

/**
 * Restyled onto the navy/gold palette. Every piece of behaviour below - the
 * clock-state resume, the GPS geofence watch, the elapsed tick, the clock
 * toggle and the timesheet submit - is unchanged.
 *
 * The task title moved out of the header and into the context card. The
 * header holds one line, and a real task title ("Warehouse picker - Ikeja,
 * evening shift") truncated there while the card below had room for all of
 * it. TierBadge is gone from the card for the same reason it left the task
 * cards: category and tier are usually the same word in practice, and the
 * pair rendered as a visible duplicate.
 */
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
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
        if ((e as { name?: string } | null)?.name === 'AbortError') return; // not instanceof DOMException: Hermes has none
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
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <AppBackHeader title="Active task" onBack={() => router.back()} />

        {error ? (
          <Banner tone="danger" icon="alert" title="Something went wrong" message={error} />
        ) : null}

        {taskQ.loading && !t ? (
          <AppLoadingCards count={1} />
        ) : t ? (
          <View style={styles.contextCard}>
            <Text style={styles.title}>{t.title}</Text>
            <View style={styles.tagRow}>
              <Text style={styles.tag}>{t.category}</Text>
            </View>

            <View style={styles.metaRow}>
              <Icon name="wallet" size={14} color={obColors.forest} />
              <Text style={styles.payText}>{pay}</Text>
            </View>

            <View style={styles.metaRow}>
              <Icon name={remote ? 'globe' : 'map-pin'} size={14} color={obColors.textMut} />
              <Text style={styles.metaText} numberOfLines={2}>
                {remote ? 'Remote' : (t.address ?? 'Physical')}
              </Text>
            </View>

            {(t.startDate || t.endDate) ? (
              <View style={styles.metaRow}>
                <Icon name="clock" size={14} color={obColors.textMut} />
                <Text style={styles.metaText}>
                  {t.startDate ? formatDate(t.startDate) : ''}
                  {t.startDate && t.endDate ? ' – ' : ''}
                  {t.endDate ? formatDate(t.endDate) : ''}
                </Text>
              </View>
            ) : null}
          </View>
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
          <View style={{ marginTop: 28 }}>
            <Banner
              tone="money"
              icon="check-circle"
              title="Timesheet submitted"
              message="Awaiting approval: check status in Profile › Timesheets."
            />
          </View>
        ) : (
          <View style={{ marginTop: 28, gap: 10 }}>
            <AppPrimaryButton
              label="Submit timesheet"
              icon="check"
              variant="outline"
              onPress={submitTimesheet}
              disabled={clockedIn || elapsed === 0 || busy}
            />
            {clockedIn ? (
              <Text style={styles.hint}>Clock out before submitting your hours.</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  contextCard: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 16.5, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, lineHeight: 22 },
  tagRow: { flexDirection: 'row' },
  tag: {
    fontSize: 10.5,
    fontWeight: '700',
    color: obColors.navy,
    backgroundColor: obColors.sand,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  payText: { color: obColors.forest, fontSize: 13, fontWeight: '800' },
  metaText: { flex: 1, color: obColors.textMut, fontSize: 12.5 },
  timerWrap: { alignItems: 'center', marginTop: 32, gap: 4 },
  timerLabel: { color: obColors.textMut, fontSize: 13, fontWeight: '600' },
  timer: {
    color: obColors.navy,
    fontSize: 56,
    fontFamily: 'Raleway_800ExtraBold',
    fontVariant: ['tabular-nums'],
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: obColors.mgreenBg,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  liveDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: obColors.mgreen },
  liveText: { color: obColors.forest, fontSize: 12.5, fontWeight: '700' },
  clock: { alignItems: 'center', marginTop: 26 },
  hint: { color: obColors.textMut, fontSize: 12.5, textAlign: 'center' },
});
