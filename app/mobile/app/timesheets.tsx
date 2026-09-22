import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppBackHeader,
  AppPrimaryButton,
  AppStatusPill,
  AppEmptyState,
  AppErrorState,
  AppLoadingCards,
  type AppPillTone,
} from '../src/appui/AppUI';
import { Icon } from '../src/components/Icon';
import { obColors, obRadii } from '../src/onboarding/onboardingTheme';
import { api, ApiError } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import { formatDate } from '../src/lib/format';
import type { Timesheet } from '../src/api/types';

/**
 * Restyled onto the navy/gold palette. The status mapping, the hours
 * formatting, which statuses may be disputed, and the whole dispute-filing
 * flow (including its 10-character floor) are unchanged.
 */
const STATUS_MAP: Record<string, { label: string; tone: AppPillTone }> = {
  SUBMITTED: { label: 'Pending', tone: 'review' },
  APPROVED: { label: 'Approved', tone: 'ready' },
  DISPUTED: { label: 'Disputed', tone: 'attn' },
};

function TimesheetCard({
  ts,
  onDispute,
}: {
  ts: Timesheet;
  onDispute: (ts: Timesheet) => void;
}) {
  const cfg = STATUS_MAP[ts.status] ?? { label: ts.status, tone: 'review' as AppPillTone };
  const h = ts.hours;
  const hoursLabel = `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(2)} hr${h !== 1 ? 's' : ''}`;
  const canDispute = ts.status === 'SUBMITTED' || ts.status === 'APPROVED';
  const alreadyDisputed = ts.status === 'DISPUTED';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.taskTitle} numberOfLines={2}>{ts.task.title}</Text>
        <AppStatusPill tone={cfg.tone} label={cfg.label} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.hours}>{hoursLabel}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.period} numberOfLines={1}>
          {formatDate(ts.periodStart)} – {formatDate(ts.periodEnd)}
        </Text>
      </View>
      <Text style={styles.filed}>Filed {formatDate(ts.createdAt)}</Text>

      {alreadyDisputed ? (
        <View style={styles.disputedNote}>
          <Icon name="alert" size={13} color={obColors.orangeInk} />
          <Text style={styles.disputedText}>Dispute open: check Disputes for updates</Text>
        </View>
      ) : canDispute ? (
        <Pressable
          onPress={() => onDispute(ts)}
          style={styles.disputeBtn}
          accessibilityRole="button"
        >
          <Text style={styles.disputeBtnText}>Report an issue</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DisputeSheet({
  ts,
  onClose,
  onFiled,
}: {
  ts: Timesheet | null;
  onClose: () => void;
  onFiled: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason('');
    setBusy(false);
    setDone(false);
    setError(null);
    onClose();
  }

  async function submit() {
    if (!ts) return;
    setBusy(true);
    setError(null);
    try {
      await api.raiseDispute({ entityType: 'TIMESHEET', entityId: ts.id, reason });
      setDone(true);
      onFiled();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not file dispute.');
    } finally {
      setBusy(false);
    }
  }

  const h = ts?.hours ?? 0;
  const hoursLabel = `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(2)} hrs`;

  return (
    <Modal visible={!!ts} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.grabber} />

          {done ? (
            <View style={styles.doneWrap}>
              <View style={styles.doneIcon}>
                <Icon name="check-circle" size={32} color={obColors.mgreen} strokeWidth={2} />
              </View>
              <Text style={styles.sheetTitle}>Dispute filed</Text>
              <Text style={styles.sheetSub}>
                Our team will review within 2 business days.
              </Text>
              <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 4 }}>
                <AppPrimaryButton
                  label="View disputes"
                  icon="list"
                  onPress={() => { close(); router.push('/disputes'); }}
                />
                <AppPrimaryButton label="Done" variant="outline" onPress={close} />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.sheetTitle}>Report a timesheet issue</Text>
              <Text style={styles.sheetSub} numberOfLines={2}>{ts?.task.title}</Text>

              <View style={styles.summaryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLabel}>Hours submitted</Text>
                  <Text style={styles.summaryValue}>{hoursLabel}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLabel}>Period</Text>
                  <Text style={styles.summaryValue}>
                    {ts ? `${formatDate(ts.periodStart)} – ${formatDate(ts.periodEnd)}` : ''}
                  </Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Describe the issue</Text>
              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. I clocked 8 hours but only 6 were recorded. GPS dropped during the last shift."
                placeholderTextColor={obColors.textFaint}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {reason.length > 0 && reason.trim().length < 10 ? (
                <Text style={styles.inputHint}>{10 - reason.trim().length} more characters needed</Text>
              ) : null}
              {error ? <Text style={styles.inputError}>{error}</Text> : null}
              <AppPrimaryButton
                label="Submit dispute"
                icon="alert"
                onPress={submit}
                loading={busy}
                disabled={reason.trim().length < 10 || busy}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function TimesheetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const timesheets = useAsync<Timesheet[]>((signal) => api.myTimesheets(signal), []);
  const [disputeTs, setDisputeTs] = useState<Timesheet | null>(null);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={timesheets.loading && !!timesheets.data}
            onRefresh={timesheets.reload}
            tintColor={obColors.navy}
          />
        }
      >
        <AppBackHeader title="Timesheets" onBack={() => router.back()} />
        <Text style={styles.subtitle}>Your submitted hour records</Text>

        {timesheets.loading && !timesheets.data ? (
          <AppLoadingCards count={2} />
        ) : timesheets.error && !timesheets.data ? (
          <AppErrorState message={timesheets.error} onRetry={timesheets.reload} />
        ) : (timesheets.data ?? []).length === 0 ? (
          <AppEmptyState
            icon="clock"
            title="No timesheets yet"
            message="After clocking out of a task, submit your hours. They'll appear here for approval."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {(timesheets.data ?? []).map((ts) => (
              <TimesheetCard
                key={ts.id}
                ts={ts}
                onDispute={setDisputeTs}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <DisputeSheet
        ts={disputeTs}
        onClose={() => setDisputeTs(null)}
        onFiled={() => {
          setDisputeTs(null);
          timesheets.reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  subtitle: { fontSize: 13, color: obColors.textMut, marginTop: -8, marginBottom: 16 },
  card: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 14,
    gap: 4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  taskTitle: { flex: 1, color: obColors.text, fontSize: 14, fontFamily: 'Raleway_800ExtraBold', lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  hours: { color: obColors.navy, fontSize: 13, fontWeight: '800' },
  dot: { color: obColors.textFaint, fontSize: 12.5 },
  period: { color: obColors.textMut, fontSize: 12.5, flex: 1 },
  filed: { color: obColors.textFaint, fontSize: 11 },
  disputedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  disputedText: { color: obColors.orangeInk, fontSize: 11.5, flex: 1 },
  disputeBtn: { marginTop: 4, alignSelf: 'flex-start' },
  disputeBtnText: { color: obColors.goldDeep, fontSize: 12.5, fontWeight: '700' },

  // Sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,30,0.42)' },
  sheet: {
    backgroundColor: obColors.bg,
    borderTopLeftRadius: obRadii.hero,
    borderTopRightRadius: obRadii.hero,
    padding: 20,
    gap: 10,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 4, backgroundColor: obColors.line, marginBottom: 8 },
  sheetTitle: { color: obColors.navy, fontSize: 18, fontFamily: 'Raleway_800ExtraBold' },
  sheetSub: { color: obColors.textMut, fontSize: 13 },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: obColors.sand,
    borderRadius: obRadii.card,
    padding: 14,
    marginTop: 2,
  },
  summaryLabel: { color: obColors.textMut, fontSize: 11, marginBottom: 2 },
  summaryValue: { color: obColors.text, fontSize: 13, fontWeight: '700' },
  inputLabel: { color: obColors.text, fontWeight: '700', fontSize: 13, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.field,
    padding: 14,
    fontSize: 14,
    color: obColors.text,
    backgroundColor: obColors.white,
    minHeight: 96,
  },
  inputHint: { color: obColors.textMut, fontSize: 11.5 },
  inputError: { color: obColors.dangerInk, fontSize: 12.5 },
  doneWrap: { gap: 10, alignItems: 'center', paddingVertical: 8 },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: obColors.mgreenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
