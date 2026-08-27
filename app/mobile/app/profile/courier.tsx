/**
 * Courier setup: what a rider still has to do before they can be given
 * deliveries (Blueprint §3.2).
 *
 * THE ORDER OF THE LIST IS THE PRODUCT. Identity first, because everything
 * after it is a claim about a person nobody has confirmed exists. The vehicle
 * second, because what it is decides which papers the rest of the list asks
 * for - a rider delivering on foot is asked for none, and a step somebody can
 * never complete teaches them to ignore the whole list.
 *
 * "With Afrizone" is not a failure and does not count as outstanding. A rider
 * who has uploaded everything and is waiting on a review has nothing left to
 * do; telling them otherwise sends them chasing work that is not theirs.
 *
 * Nothing here decides whether a delivery can be taken. That is the server's
 * eligibility engine, per task. This screen is a progress report, and if it
 * ever starts refusing things it has become the wrong screen.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { LoadingState, ErrorState } from '../../src/components/Feedback';
import { colors, spacing, type, radii, fontFamily, layout } from '../../src/theme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import type { CourierReadiness, CourierStep, CourierStepState } from '../../src/api/types';

const MARK: Record<CourierStepState, { label: string; color: string; icon: 'check' | 'clock' | 'alert' }> = {
  DONE: { label: 'Done', color: colors.money, icon: 'check' },
  // Gold, not red. Waiting on Afrizone is not the rider's problem, and a red
  // badge against a step they have finished reads as something they did wrong.
  WAITING: { label: 'With Afrizone', color: colors.gold, icon: 'clock' },
  TODO: { label: 'To do', color: colors.textMuted, icon: 'clock' },
  PROBLEM: { label: 'Needs fixing', color: colors.danger, icon: 'alert' },
};

export default function CourierScreen() {
  const router = useRouter();
  const load = useAsync((signal) => api.courierReadiness(signal));

  const [data, setData] = useState<CourierReadiness | null>(null);
  const [vehicleType, setVehicleType] = useState('');
  const [plate, setPlate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (load.data && !data) {
      setData(load.data);
      setVehicleType(load.data.vehicle?.type ?? '');
      setPlate(load.data.vehicle?.plateNumber ?? '');
    }
  }, [load.data, data]);

  if (load.loading && !data) return <Screen title="Courier setup" back><LoadingState /></Screen>;
  if (load.error && !data) {
    return (
      <Screen title="Courier setup" back>
        <ErrorState message={load.error} onRetry={load.reload} />
      </Screen>
    );
  }
  if (!data) return <Screen title="Courier setup" back><LoadingState /></Screen>;

  const chosen = data.vehicleTypes.find((v) => v.value === vehicleType);
  const needsPlate = chosen?.requiresPlate ?? false;
  const changed =
    vehicleType !== (data.vehicle?.type ?? '') ||
    (needsPlate && plate.trim() !== (data.vehicle?.plateNumber ?? ''));

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const next = await api.saveCourierVehicle(vehicleType, needsPlate ? plate.trim() : null);
      setData(next);
      // The server clears the plate when a vehicle stops needing one; echoing
      // it back stops the form showing a plate the record no longer holds.
      setPlate(next.vehicle?.plateNumber ?? '');
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Courier setup"
      subtitle={
        data.ready
          ? 'You are set up for delivery work.'
          : data.outstanding === 0
            ? 'Everything is with Afrizone. Nothing for you to do.'
            : `${data.outstanding} thing${data.outstanding === 1 ? '' : 's'} left for you to do.`
      }
      back
      onRefresh={load.reload}
      refreshing={load.loading}
    >
      <Card padded={false} style={styles.list}>
        {data.steps.map((step: CourierStep, i: number) => {
          const mark = MARK[step.state];
          const actionable = step.state === 'TODO' || step.state === 'PROBLEM';
          const target =
            step.key === 'identity'
              ? '/(auth)/kyc'
              : step.key === 'vehicle'
                ? null
                : '/profile/credentials';
          return (
            <Pressable
              key={step.key}
              style={[styles.row, i > 0 && styles.rowDivider]}
              // A row that leads nowhere must not look pressable. The vehicle
              // step is answered on this screen, so it has no destination.
              onPress={actionable && target ? () => router.push(target as never) : undefined}
              disabled={!actionable || !target}
            >
              <View style={[styles.dot, { backgroundColor: mark.color }]}>
                <Icon name={mark.icon} size={12} color="#fff" />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{step.label}</Text>
                <Text style={styles.rowDetail}>{step.detail}</Text>
              </View>
              <Text style={[styles.mark, { color: mark.color }]}>{mark.label}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Text style={styles.section}>What do you deliver on?</Text>
      <Card>
        <View style={styles.chips}>
          {data.vehicleTypes.map((v) => {
            const on = v.value === vehicleType;
            return (
              <Pressable
                key={v.value}
                onPress={() => {
                  setVehicleType(v.value);
                  setSaveError(null);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {needsPlate && (
          <View style={styles.plateWrap}>
            <Text style={styles.label}>Plate number</Text>
            <TextInput
              value={plate}
              onChangeText={setPlate}
              placeholder="ABC 123 DE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        )}

        {saveError && <Text style={styles.error}>{saveError}</Text>}

        <Button
          label={data.vehicle ? 'Update vehicle' : 'Save vehicle'}
          onPress={save}
          loading={saving}
          disabled={!vehicleType || !changed || (needsPlate && !plate.trim())}
          style={styles.save}
        />
      </Card>

      <Text style={styles.footnote}>
        Being set up does not guarantee any particular delivery. Each job still has its own
        requirements, and you will always be told which one is missing.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: {
    color: colors.text,
    fontSize: type.size.base,
    fontFamily: fontFamily.bold,
  },
  rowDetail: { color: colors.textMuted, fontSize: type.size.sm, lineHeight: 18 },
  mark: { fontSize: type.size.xs, fontFamily: fontFamily.bold },
  section: {
    color: colors.text,
    fontSize: type.size.md,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    // 44px minimum touch target, per DESIGN_SPEC 7 - a chip row is exactly the
    // place that quietly drops below it.
    minHeight: layout.hitTarget,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.text, fontSize: type.size.sm },
  chipTextOn: { color: '#fff', fontFamily: fontFamily.bold },
  plateWrap: { marginBottom: spacing.md },
  label: { color: colors.textMuted, fontSize: type.size.sm, marginBottom: spacing.xs },
  input: {
    height: layout.hitTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: type.size.base,
  },
  error: { color: colors.danger, fontSize: type.size.sm, marginBottom: spacing.sm },
  save: { marginTop: spacing.xs },
  footnote: {
    color: colors.textMuted,
    fontSize: type.size.sm,
    marginTop: spacing.lg,
    lineHeight: 19,
  },
});
