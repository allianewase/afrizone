import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { TierBadge } from '../../src/components/TierBadge';
import { MoneyText } from '../../src/components/MoneyText';
import { Banner, LoadingState, ErrorState } from '../../src/components/Feedback';
import { RequirementsCard } from '../../src/components/RequirementsCard';
import { colors, spacing, type, radii, layout, fontFamily } from '../../src/theme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { useAuth } from '../../src/auth/AuthContext';
import { payLabel, formatDate, netFromGross } from '../../src/lib/format';
import type { Blocker, Task } from '../../src/api/types';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  // REAL: GET /api/tasks/:id, which includes applications[] for this task.
  const task = useAsync<Task | null>(
    (signal) => (id ? api.task(id, signal) : Promise.resolve(null)),
    [id]
  );

  /**
   * Re-read on every return to this screen.
   *
   * A worker who taps "Upload" on a blocker, adds the document and comes back
   * must not find the same refusal waiting for them. The reload is what turns
   * the requirements card from a verdict into a thing they can act on and see
   * change.
   */
  useFocusEffect(
    React.useCallback(() => {
      task.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])
  );

  const t = task.data;
  const remote = t?.locationType === 'REMOTE';
  const closed = t ? t.status !== 'OPEN' : false;

  /**
   * The verdict comes from the server, not from this screen.
   *
   * This used to be two local checks: the tier read off the user object, and
   * KYC insisted on TIER_APPROVED. Both were quietly wrong. The server accepts
   * VERIFIED as well as TIER_APPROVED, and only asks about identity at all when
   * the task requires it - so a verified worker was being refused here for an
   * ungated task the server would have accepted. That is the exact drift the
   * eligibility engine exists to remove, and the fix is to stop deciding here.
   */
  const eligibility = t?.eligibility ?? null;
  const canApply = eligibility ? eligibility.eligible : true;

  // Check server-side application state so "Apply" button reflects reality on fresh load.
  const myApp = t?.applications?.find((a) => a.workerId === user?.id);
  const applied = justApplied || (myApp != null && myApp.status !== 'REJECTED');

  return (
    <Screen title="Task" back scroll>
      {task.loading && !task.data ? (
        <LoadingState />
      ) : task.error ? (
        <ErrorState message={task.error} onRetry={task.reload} />
      ) : !t ? (
        <ErrorState message="Task not found." />
      ) : (
        <>
          <View style={styles.headRow}>
            <TierBadge tier={t.tier} />
            <Text style={styles.category}>{t.category}</Text>
          </View>
          <Text style={styles.title}>{t.title}</Text>

          {/* Pay model prominent */}
          <Card style={styles.payCard}>
            <Text style={styles.payLabel}>{t.payModel === 'HOURLY' ? 'Hourly rate' : 'Fixed pay'}</Text>
            <View style={styles.payRow}>
              <MoneyText
                amount={t.payModel === 'HOURLY' ? t.rate : t.budget ?? t.rate}
                size={type.size.displayLg}
                color={colors.clay}
                weight="800"
              />
              <Text style={styles.payUnit}>{t.payModel === 'HOURLY' ? '/hr' : ''}</Text>
            </View>
            <Text style={styles.netHint}>
              ≈ net{' '}
              <MoneyText
                amount={netFromGross(t.payModel === 'HOURLY' ? t.rate ?? 0 : t.budget ?? 0)}
                size={type.size.sm}
                color={colors.money}
              />{' '}
              after 5% WHT
            </Text>
          </Card>

          <View style={styles.metaGrid}>
            <Meta icon={remote ? 'globe' : 'map-pin'} label="Location" value={remote ? 'Remote' : t.address || 'On-site'} />
            <Meta icon="clock" label="Closes" value={formatDate(t.deadline)} />
            <Meta icon="list" label="Slots" value={`${Math.max(0, t.slots - (t.filledCount ?? 0))} of ${t.slots} left`} />
            <Meta icon="briefcase" label="Pay model" value={payLabel(t.payModel, t.rate, t.budget)} />
          </View>

          {!remote && t.lat != null && t.lng != null ? (
            <Pressable
              style={styles.directions}
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`
                )
              }
              accessibilityRole="button"
            >
              <Icon name="map-pin" size={15} color={colors.clay} />
              <Text style={styles.directionsText}>Get directions</Text>
              <Icon name="chevron-right" size={14} color={colors.clay} />
            </Pressable>
          ) : null}

          {!remote && t.geofenceRadius ? (
            <Card tinted style={styles.geofence}>
              <Icon name="map-pin" size={18} color={colors.clay} />
              <Text style={styles.geofenceText}>
                Geofenced check-in within {t.geofenceRadius}m of the site.
              </Text>
            </Card>
          ) : null}

          <Text style={styles.section}>About this task</Text>
          <Text style={styles.desc}>{t.description}</Text>

          {/* What this task asks for, and where this worker stands against it.
              Every unmet row is tappable and lands on the screen that fixes
              it - being told no without being told where to go is the version
              of this feature that makes people give up. */}
          <RequirementsCard requirements={t.requirements} eligibility={eligibility} />
        </>
      )}

      {/* Sticky-ish apply action */}
      {t && !task.loading ? (
        <View style={{ marginTop: spacing.xl }}>
          {applied ? (
            <Button
              label={myApp?.status === 'APPROVED' ? 'Approved: see My Tasks' : 'Applied: awaiting approval'}
              variant="secondary"
              icon={myApp?.status === 'APPROVED' ? 'check-circle' : 'check'}
              disabled
            />
          ) : closed ? (
            <Button label="Applications closed" variant="secondary" disabled />
          ) : (
            <Button
              label={canApply ? 'Apply for this task' : 'Not yet - see what is needed'}
              icon="chevron-right"
              onPress={() => setSheetOpen(true)}
              disabled={!canApply}
            />
          )}
        </View>
      ) : null}

      {t ? (
        <ApplySheet
          visible={sheetOpen}
          task={t}
          onClose={() => setSheetOpen(false)}
          onApplied={() => {
            setJustApplied(true);
            setSheetOpen(false);
            router.push('/(tabs)/tasks');
          }}
        />
      ) : null}
    </Screen>
  );
}

function Meta({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <View>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

function ApplySheet({
  visible,
  task,
  onClose,
  onApplied,
}: {
  visible: boolean;
  task: Task;
  onClose: () => void;
  onApplied: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pitch, setPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A refusal that arrived between opening this screen and pressing submit -
  // a licence that expired this morning, a credential revoked while the sheet
  // was open. Rare, and exactly when a bare error message is least helpful.
  const [blockers, setBlockers] = useState<Blocker[]>([]);

  async function submit() {
    setBusy(true);
    setError(null);
    setBlockers([]);
    try {
      // REAL: POST /api/applications {taskId, pitch}
      await api.apply(task.id, pitch.trim() || undefined);
      onApplied();
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Could not submit application.';
      setError(msg);
      const body =
        e instanceof ApiError && e.body && typeof e.body === 'object'
          ? (e.body as { blockers?: Blocker[] })
          : null;
      // More than one thing is missing, so list them: the headline names only
      // the first, and fixing one at a time to discover the next is how people
      // give up.
      if (body?.blockers && body.blockers.length > 1) setBlockers(body.blockers);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>Apply</Text>
        <Text style={styles.sheetSub}>Add a short pitch and your availability.</Text>
        <TextInput
          value={pitch}
          onChangeText={setPitch}
          multiline
          placeholder="Why you’re a good fit, and when you’re free…"
          placeholderTextColor={colors.textFaint}
          style={styles.pitch}
          accessibilityLabel="Pitch"
        />
        {error ? <Banner tone="danger" title="Couldn’t apply" message={error} /> : null}
        {blockers.length > 1
          ? blockers.slice(1).map((b, i) => (
              <Text key={`${b.code}-${b.ref ?? i}`} style={styles.blockerLine}>
                • {b.message}
              </Text>
            ))
          : null}
        <Button label="Submit application" onPress={submit} loading={busy} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  blockerLine: {
    color: colors.dangerInk,
    fontSize: type.size.sm,
    lineHeight: 19,
    marginTop: 2,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  title: { color: colors.text, fontSize: type.size.xxl, fontFamily: fontFamily.extrabold, marginTop: spacing.sm, lineHeight: 30 },
  payCard: { marginTop: spacing.lg, gap: 2 },
  payLabel: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  payRow: { flexDirection: 'row', alignItems: 'baseline' },
  payUnit: { color: colors.textMuted, fontSize: type.size.lg, fontWeight: '700' },
  netHint: { color: colors.textMuted, fontSize: type.size.sm, marginTop: 4 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg },
  metaItem: { flexDirection: 'row', gap: spacing.sm, width: '50%', paddingVertical: spacing.sm, alignItems: 'flex-start' },
  metaLabel: { color: colors.textMuted, fontSize: type.size.xs },
  metaValue: { color: colors.text, fontSize: type.size.base, fontWeight: '700' },
  directions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.button,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  directionsText: { color: colors.goldInk, fontWeight: '700', fontSize: type.size.sm },
  geofence: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  geofenceText: { flex: 1, color: colors.text, fontSize: type.size.sm },
  section: { color: colors.text, fontSize: type.size.lg, fontFamily: fontFamily.extrabold, marginTop: spacing.xl, marginBottom: spacing.sm },
  desc: { color: colors.text, fontSize: type.size.md, lineHeight: 24 },
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: layout.screenPadding,
    gap: spacing.md,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 100, backgroundColor: colors.line, marginBottom: spacing.sm },
  sheetTitle: { color: colors.text, fontSize: type.size.xl, fontFamily: fontFamily.extrabold },
  sheetSub: { color: colors.textMuted, fontSize: type.size.base },
  pitch: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.input,
    padding: spacing.md,
    fontSize: type.size.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
