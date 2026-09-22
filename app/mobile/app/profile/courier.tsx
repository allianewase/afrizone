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
 *
 * Restyled onto the navy/gold palette; the step order, the routing, the
 * vehicle form and the save round-trip are unchanged.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackHeader, AppPrimaryButton, AppErrorState, AppLoadingCards } from '../../src/appui/AppUI';
import { Icon } from '../../src/components/Icon';
import { obColors, obRadii } from '../../src/onboarding/onboardingTheme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import type { CourierReadiness, CourierStep, CourierStepState } from '../../src/api/types';

/**
 * `dot` is the state's colour and `ink` is its label's. They match except for
 * WAITING: amber has no ink-weight variant, and `orangeInk` on white is
 * 3.12:1, so that one label falls back to `text` while its dot keeps the
 * colour. Everything else clears 4.5:1 on its own (forest 8.0, dangerInk
 * 6.59, textMut 5.15).
 *
 * WAITING is amber rather than red for the reason the file header gives:
 * waiting on Afrizone is not the rider's problem, and a red mark against a
 * step they have finished reads as something they did wrong.
 */
const MARK: Record<CourierStepState, { label: string; dot: string; ink: string; icon: 'check' | 'clock' | 'alert' }> = {
  DONE: { label: 'Done', dot: obColors.forest, ink: obColors.forest, icon: 'check' },
  WAITING: { label: 'With Afrizone', dot: obColors.orangeInk, ink: obColors.text, icon: 'clock' },
  TODO: { label: 'To do', dot: obColors.textMut, ink: obColors.textMut, icon: 'clock' },
  PROBLEM: { label: 'Needs fixing', dot: obColors.danger, ink: obColors.dangerInk, icon: 'alert' },
};

export default function CourierScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const chosen = data?.vehicleTypes.find((v) => v.value === vehicleType);
  const needsPlate = chosen?.requiresPlate ?? false;
  const changed = data
    ? vehicleType !== (data.vehicle?.type ?? '') ||
      (needsPlate && plate.trim() !== (data.vehicle?.plateNumber ?? ''))
    : false;

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

  const subtitle = data
    ? data.ready
      ? 'You are set up for delivery work.'
      : data.outstanding === 0
        ? 'Everything is with Afrizone. Nothing for you to do.'
        : `${data.outstanding} thing${data.outstanding === 1 ? '' : 's'} left for you to do.`
    : '';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={load.loading && !!data} onRefresh={load.reload} tintColor={obColors.navy} />}
      >
        <AppBackHeader title="Courier setup" onBack={() => router.back()} />
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        {load.loading && !data ? (
          <AppLoadingCards count={2} />
        ) : load.error && !data ? (
          <AppErrorState message={load.error} onRetry={load.reload} />
        ) : !data ? (
          <AppLoadingCards count={2} />
        ) : (
          <>
            <View style={styles.list}>
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
                    <View style={[styles.dot, { backgroundColor: mark.dot }]}>
                      <Icon name={mark.icon} size={12} color={obColors.white} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{step.label}</Text>
                      <Text style={styles.rowDetail}>{step.detail}</Text>
                    </View>
                    <Text style={[styles.mark, { color: mark.ink }]}>{mark.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.section}>What do you deliver on?</Text>
            <View style={styles.card}>
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
                    placeholderTextColor={obColors.textFaint}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>
              )}

              {saveError && <Text style={styles.error}>{saveError}</Text>}

              <AppPrimaryButton
                label={data.vehicle ? 'Update vehicle' : 'Save vehicle'}
                onPress={save}
                loading={saving}
                disabled={!vehicleType || !changed || (needsPlate && !plate.trim())}
              />
            </View>

            <Text style={styles.footnote}>
              Being set up does not guarantee any particular delivery. Each job still has its own
              requirements, and you will always be told which one is missing.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  subtitle: { fontSize: 13, color: obColors.textMut, marginTop: -8, marginBottom: 16, lineHeight: 18 },
  list: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    overflow: 'hidden',
    marginBottom: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: obColors.line },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: obColors.text, fontSize: 13.5, fontWeight: '700' },
  rowDetail: { color: obColors.textMut, fontSize: 12, lineHeight: 17 },
  mark: { fontSize: 11, fontWeight: '700', flexShrink: 0 },
  section: { color: obColors.navy, fontSize: 15.5, fontFamily: 'Raleway_800ExtraBold', marginBottom: 10 },
  card: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 16,
    gap: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    // 44px minimum touch target, per DESIGN_SPEC 7 - a chip row is exactly the
    // place that quietly drops below it.
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: obRadii.chip,
    borderWidth: 1.3,
    borderColor: obColors.line,
    backgroundColor: obColors.white,
  },
  chipOn: { backgroundColor: obColors.navy, borderColor: obColors.navy },
  chipText: { color: obColors.text, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: obColors.white, fontWeight: '800' },
  plateWrap: { gap: 6 },
  label: { color: obColors.textMut, fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.field,
    paddingHorizontal: 13,
    color: obColors.text,
    backgroundColor: obColors.white,
    fontSize: 15,
  },
  error: { color: obColors.dangerInk, fontSize: 12.5 },
  footnote: {
    color: obColors.textMut,
    fontSize: 12.5,
    marginTop: 20,
    lineHeight: 18,
  },
});
