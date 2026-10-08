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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppBackHeader,
  AppPrimaryButton,
  AppStatusPill,
  AppErrorState,
  AppLoadingCards,
  type AppPillTone,
} from '../../src/appui/AppUI';
import { MoneyText } from '../../src/components/MoneyText';
import { Icon } from '../../src/components/Icon';
import { Banner } from '../../src/components/Feedback';
import { obColors, obRadii } from '../../src/onboarding/onboardingTheme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { formatDate, formatNaira } from '../../src/lib/format';
import type { PaymentDetail, PaymentStatus } from '../../src/api/types';

/**
 * Restyled onto the navy/gold palette. The gross/WHT/net breakdown, which
 * statuses may be disputed, and the dispute-filing flow are unchanged.
 *
 * MoneyText stays: its colour and size are props, so it carries the new
 * palette without touching a component five screens share.
 */
const STATUS_TONE: Record<PaymentStatus, { tone: AppPillTone; label: string }> = {
  PENDING: { tone: 'await', label: 'Awaiting approval' },
  APPROVED: { tone: 'progress', label: 'Approved' },
  RELEASED: { tone: 'paid', label: 'Paid' },
  DISPUTED: { tone: 'attn', label: 'Disputed' },
};

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [disputeOpen, setDisputeOpen] = useState(false);

  const paymentQ = useAsync<PaymentDetail>(
    (signal) => api.myPaymentDetail(id!, signal),
    [id]
  );
  const p = paymentQ.data;

  const canDispute = p?.status === 'APPROVED' || p?.status === 'RELEASED';
  const alreadyDisputed = p?.status === 'DISPUTED';
  const isPending = p?.status === 'PENDING';
  const statusCfg = p ? STATUS_TONE[p.status] : null;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <AppBackHeader title="Payment" onBack={() => router.back()} />

        {paymentQ.loading && !p ? (
          <AppLoadingCards count={1} />
        ) : paymentQ.error && !p ? (
          <AppErrorState message={paymentQ.error} onRetry={paymentQ.reload} />
        ) : p ? (
          <>
            <Text style={styles.taskTitle}>{p.task.title}</Text>
            {statusCfg ? (
              <View style={styles.statusRow}>
                <AppStatusPill tone={statusCfg.tone} label={statusCfg.label} />
              </View>
            ) : null}

            {/* Gross → WHT → Net breakdown */}
            <View style={styles.breakdown}>
              <Row label="Gross pay" value={p.gross} color={obColors.text} />
              <View style={styles.separator} />
              <Row
                label={`Withholding Tax (${(p.whtRate * 100).toFixed(0)}%)`}
                value={-p.whtAmount}
                color={obColors.textMut}
                signed
              />
              <View style={styles.dividerFull} />
              <Row label="Net to wallet" value={p.net} color={obColors.forest} bold />
            </View>

            <Text style={styles.meta}>Filed {formatDate(p.createdAt)}</Text>

            {/* Dispute section */}
            <View style={styles.disputeSection}>
              {isPending ? (
                <Banner
                  tone="amber"
                  icon="clock"
                  title="Awaiting approval"
                  message="Your payment will appear in your wallet balance once an admin approves it."
                />
              ) : alreadyDisputed ? (
                <>
                  <Banner
                    tone="amber"
                    icon="alert"
                    title="Dispute open on this payment"
                    message="Our team is reviewing it. Check Disputes for updates."
                  />
                  <AppPrimaryButton
                    label="View disputes"
                    variant="outline"
                    icon="list"
                    onPress={() => router.push('/disputes')}
                  />
                </>
              ) : canDispute ? (
                <AppPrimaryButton
                  label="Raise a dispute"
                  variant="outline"
                  icon="alert"
                  onPress={() => setDisputeOpen(true)}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      {p && (
        <DisputeSheet
          visible={disputeOpen}
          paymentId={p.id}
          taskTitle={p.task.title}
          net={p.net}
          onClose={() => setDisputeOpen(false)}
          onFiled={() => {
            setDisputeOpen(false);
            paymentQ.reload();
          }}
        />
      )}
    </View>
  );
}

// ── Money row ────────────────────────────────────────────────────────────────
function Row({
  label,
  value,
  color,
  bold,
  signed,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  signed?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && { fontWeight: '700', color: obColors.text }]}>{label}</Text>
      <MoneyText
        amount={Math.abs(value)}
        size={bold ? 18 : 15}
        color={color}
        weight={bold ? '800' : '600'}
        signed={signed ? 'out' : undefined}
      />
    </View>
  );
}

// ── Dispute bottom sheet ──────────────────────────────────────────────────────
function DisputeSheet({
  visible,
  paymentId,
  taskTitle,
  net,
  onClose,
  onFiled,
}: {
  visible: boolean;
  paymentId: string;
  taskTitle: string;
  net: number;
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
    setBusy(true);
    setError(null);
    try {
      await api.raiseDispute({ entityType: 'PAYMENT', entityId: paymentId, reason });
      setDone(true);
      onFiled();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not file dispute.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
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
              <Text style={styles.sheetTitle}>Report an issue</Text>
              <Text style={styles.sheetSub} numberOfLines={2}>{taskTitle}</Text>

              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Net paid</Text>
                <Text style={styles.amountValue}>{formatNaira(net)}</Text>
              </View>

              <Text style={styles.inputLabel}>Describe the issue</Text>
              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. I worked 6 hours but was paid for 4."
                placeholderTextColor={obColors.textMut}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  taskTitle: {
    color: obColors.navy,
    fontSize: 19,
    fontFamily: 'Raleway_800ExtraBold',
    lineHeight: 25,
  },
  statusRow: { flexDirection: 'row', marginTop: 10 },

  // Breakdown card
  breakdown: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 16,
    gap: 12,
    marginTop: 18,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, color: obColors.textMut, fontSize: 13.5 },
  separator: { height: 1, backgroundColor: obColors.line },
  dividerFull: { height: 2, backgroundColor: obColors.line },

  meta: { color: obColors.textMut, fontSize: 12.5, marginTop: 12, marginBottom: 22 },

  disputeSection: { gap: 12 },

  // Sheet
  backdrop: { flex: 1, backgroundColor: obColors.scrim },
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
  amountRow: {
    backgroundColor: obColors.sand,
    borderRadius: obRadii.card,
    padding: 14,
    marginTop: 2,
  },
  amountLabel: { color: obColors.textMut, fontSize: 11, marginBottom: 2 },
  amountValue: { color: obColors.navy, fontSize: 19, fontFamily: 'Raleway_800ExtraBold' },
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
