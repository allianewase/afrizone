/**
 * The orders a rider is carrying (MART_INTEGRATION.md §3.1, §4).
 *
 * THIS IS THE SCREEN SOMEBODY USES STANDING OUTSIDE A SHOP, so it says the
 * shortest true thing at every point and puts the one action that matters where
 * a thumb already is. Live jobs first; finished ones below and quieter.
 *
 * THE CUSTOMER'S DOOR AND NUMBER APPEAR HERE and nowhere else in the app. They
 * are on the job, not on the posting: a public task listing every courier can
 * read is not somewhere a stranger's address belongs, and §5 only lets us hold
 * them for as long as it takes to deliver one order.
 *
 * THE CODE HAS THREE OUTCOMES, NOT TWO, and this is the part worth being
 * careful about. Right, wrong, or we could not ask. A rider told the customer
 * read it out wrong, when in fact nothing was checked, ends up arguing on a
 * doorstep about a check that never ran - so the unreachable case is worded as
 * ours, and says not to leave the goods.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Linking } from 'react-native';
import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { LoadingState, ErrorState, EmptyState } from '../src/components/Feedback';
import { colors, spacing, type, radii, fontFamily } from '../src/theme';
import { api, ApiError } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import type { Delivery, DeliveryStatus } from '../src/api/types';

/** Whole Naira. There is no currency field anywhere in this platform. */
function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG')}`;
}

const LIVE: DeliveryStatus[] = ['RECEIVED', 'STORE_ACCEPTED', 'COURIER_ASSIGNED', 'PICKED_UP'];

/** Colours for the state badge. Nothing here composes the WORDING - the server does. */
const TONE: Record<DeliveryStatus, { fg: string; bg: string }> = {
  RECEIVED: { fg: colors.textMuted, bg: colors.surfaceSand },
  STORE_ACCEPTED: { fg: colors.goldInk, bg: colors.claySoft },
  STORE_REJECTED: { fg: colors.textMuted, bg: colors.surfaceSand },
  COURIER_ASSIGNED: { fg: colors.goldInk, bg: colors.claySoft },
  PICKED_UP: { fg: colors.indigo, bg: colors.indigoSoft },
  DELIVERED: { fg: colors.moneyInk, bg: colors.moneySoft },
  FAILED: { fg: colors.dangerInk, bg: colors.dangerSoft },
  CANCELLED: { fg: colors.textMuted, bg: colors.surfaceSand },
};

function Badge({ d }: { d: Delivery }) {
  const tone = TONE[d.status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{d.statusLabel}</Text>
    </View>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <View style={styles.lineBody}>{children}</View>
    </View>
  );
}

function JobCard({ d, onChange }: { d: Delivery; onChange: (next: Delivery) => void }) {
  const [busy, setBusy] = useState<'pickup' | 'complete' | 'fail' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set only when the check could not be MADE. Deliberately its own state. */
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState('');

  async function pickUp() {
    setBusy('pickup');
    setError(null);
    try {
      onChange(await api.markPickedUp(d.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    setBusy('complete');
    setError(null);
    setUnreachable(null);
    try {
      onChange(await api.completeDelivery(d.id, code.trim()));
      setCode('');
    } catch (e) {
      // 503 is "we could not ask". It must never be shown as a wrong code.
      if (e instanceof ApiError && e.status === 503) setUnreachable(e.message);
      else setError(e instanceof ApiError ? e.message : 'Could not check that code.');
    } finally {
      setBusy(null);
    }
  }

  async function fail() {
    setBusy('fail');
    setError(null);
    try {
      onChange(await api.failDelivery(d.id, reason.trim()));
      setFailing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record that.');
    } finally {
      setBusy(null);
    }
  }

  const items = d.items
    .map((i) => `${i.qty ? `${i.qty} × ` : ''}${i.name ?? i.ref ?? 'Item'}`)
    .join(', ');

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.order}>{d.martOrderId}</Text>
        <Badge d={d} />
      </View>

      <Line label="Collect">
        <Text style={styles.strong}>{d.storeName ?? 'the store'}</Text>
        {d.pickupAddress ? <Text style={styles.body}>{d.pickupAddress}</Text> : null}
        {d.preparedAt && d.status === 'COURIER_ASSIGNED' ? (
          <Text style={styles.ready}>Packed and ready</Text>
        ) : null}
      </Line>

      <Line label="Deliver">
        {d.customerPurged ? (
          // §5: we said we would delete this seven days after the order
          // finished, and we did. Saying so is not the same as a blank row.
          <Text style={styles.muted}>Removed seven days after this order finished</Text>
        ) : (
          <>
            {d.customerName ? <Text style={styles.strong}>{d.customerName}</Text> : null}
            <Text style={styles.body}>{d.dropoffAddress ?? '—'}</Text>
            {d.dropoffInstructions ? (
              <Text style={styles.muted}>{d.dropoffInstructions}</Text>
            ) : null}
            {d.customerPhone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${d.customerPhone}`)}
                style={styles.call}
                accessibilityRole="button"
                accessibilityLabel={`Call ${d.customerName ?? 'the customer'}`}
              >
                <Icon name="phone" size={15} color={colors.goldInk} />
                <Text style={styles.callText}>{d.customerPhone}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </Line>

      {items ? (
        <Line label="Items">
          <Text style={styles.body}>{items}</Text>
          {/* What the rider is carrying is worth. Not their fee - that is on
              the task and comes from rules.DELIVERY - but somebody responsible
              for a bag of goods should know what is in their hands. */}
          <Text style={styles.muted}>{naira(d.goodsTotal)} of goods</Text>
        </Line>
      ) : null}

      {d.failureReason ? (
        <Line label="Reported">
          <Text style={styles.body}>{d.failureReason}</Text>
        </Line>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {unreachable ? (
        // Not styled as the rider's mistake, because nothing was checked.
        <View style={styles.notice}>
          {/* Leads with the action, not the fault, and does not repeat the
              sentence the server writes underneath. */}
          <Text style={styles.noticeTitle}>Not checked — do not leave the goods</Text>
          <Text style={styles.noticeBody}>
            {unreachable} Try again in a moment. If it keeps failing, call Afrizone before you
            leave.
          </Text>
        </View>
      ) : null}

      {d.status === 'COURIER_ASSIGNED' ? (
        <Button
          label="Collected from the store"
          onPress={pickUp}
          loading={busy === 'pickup'}
          style={styles.action}
        />
      ) : null}

      {d.status === 'PICKED_UP' && !failing ? (
        <View style={styles.action}>
          <Text style={styles.fieldLabel}>The customer&apos;s code</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            placeholder="4821"
            placeholderTextColor={colors.textFaint}
            style={styles.codeInput}
            accessibilityLabel="The code the customer received"
          />
          <Text style={styles.hint}>
            AfriZoneMart sent this to the customer. Ask them to read it out — it is the only
            thing that completes the delivery.
          </Text>
          <Button
            label="Complete delivery"
            onPress={complete}
            loading={busy === 'complete'}
            disabled={code.trim().length === 0}
            style={styles.gap}
          />
          <Pressable onPress={() => setFailing(true)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Could not deliver</Text>
          </Pressable>
        </View>
      ) : null}

      {d.status === 'PICKED_UP' && failing ? (
        <View style={styles.action}>
          <Text style={styles.fieldLabel}>What happened?</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Nobody at the address after three calls"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
          />
          <Text style={styles.hint}>
            Afrizone reads this. It decides what happens to the goods and to your pay for the trip.
          </Text>
          <Button
            label="Report it"
            onPress={fail}
            loading={busy === 'fail'}
            disabled={reason.trim().length === 0}
            style={styles.gap}
          />
          <Pressable onPress={() => setFailing(false)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

export default function DeliveriesScreen() {
  const load = useAsync((signal) => api.myDeliveries(signal));
  const [jobs, setJobs] = useState<Delivery[] | null>(null);

  useEffect(() => {
    if (load.data) setJobs(load.data);
  }, [load.data]);

  function replace(next: Delivery) {
    setJobs((cur) => (cur ?? []).map((j) => (j.id === next.id ? { ...j, ...next } : j)));
  }

  if (load.loading && !jobs) {
    return (
      <Screen title="Deliveries" back>
        <LoadingState />
      </Screen>
    );
  }
  if (load.error && !jobs) {
    return (
      <Screen title="Deliveries" back>
        <ErrorState message={load.error} onRetry={load.reload} />
      </Screen>
    );
  }

  const all = jobs ?? [];
  const live = all.filter((j) => LIVE.includes(j.status));
  const done = all.filter((j) => !LIVE.includes(j.status));

  return (
    <Screen
      title="Deliveries"
      subtitle={live.length > 0 ? `${live.length} on the go` : undefined}
      back
      onRefresh={load.reload}
      refreshing={load.loading}
    >
      {all.length === 0 ? (
        <EmptyState
          icon="map-pin"
          title="Nothing to carry yet"
          message="Delivery jobs are posted like any other work. Apply for one, and it appears here once Afrizone assigns it to you."
        />
      ) : null}

      {live.map((j) => (
        <JobCard key={j.id} d={j} onChange={replace} />
      ))}

      {done.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Finished</Text>
          {done.map((j) => (
            <JobCard key={j.id} d={j} onChange={replace} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  order: {
    fontSize: type.size.base,
    fontFamily: fontFamily.bold,
    color: colors.text,
    flexShrink: 1,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  badgeText: { fontSize: type.size.xs, fontFamily: fontFamily.bold },

  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  lineLabel: { width: 66, fontSize: type.size.sm, color: colors.textFaint },
  lineBody: { flex: 1, gap: 2 },

  strong: { fontSize: type.size.base, fontFamily: fontFamily.bold, color: colors.text },
  body: { fontSize: type.size.base, color: colors.text },
  muted: { fontSize: type.size.sm, color: colors.textMuted },
  ready: { fontSize: type.size.sm, color: colors.moneyInk, fontFamily: fontFamily.bold },

  call: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  callText: { fontSize: type.size.base, color: colors.goldInk, fontFamily: fontFamily.bold },

  error: {
    fontSize: type.size.sm,
    color: colors.dangerInk,
    marginTop: spacing.sm,
  },
  notice: {
    backgroundColor: colors.claySoft,
    borderRadius: radii.input,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeTitle: { fontSize: type.size.base, fontFamily: fontFamily.bold, color: colors.goldInk },
  noticeBody: { fontSize: type.size.sm, color: colors.text, marginTop: 4, lineHeight: 19 },

  action: { marginTop: spacing.lg },
  gap: { marginTop: spacing.md },
  fieldLabel: {
    fontSize: type.size.sm,
    fontFamily: fontFamily.bold,
    color: colors.text,
    marginBottom: 6,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: type.size.xl,
    // Read out loud, digit by digit, usually in a hurry. Wide tracking makes a
    // mistyped code visible before it is submitted.
    letterSpacing: 6,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: type.size.base,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  hint: { fontSize: type.size.xs, color: colors.textFaint, marginTop: 6, lineHeight: 17 },

  secondary: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  secondaryText: { fontSize: type.size.base, color: colors.textMuted, fontFamily: fontFamily.bold },

  sectionTitle: {
    fontSize: type.size.md,
    fontFamily: fontFamily.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
