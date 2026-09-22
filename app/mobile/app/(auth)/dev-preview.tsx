/**
 * THROWAWAY, FOR LIVE REVIEW. Every state built in the deliveries redesign,
 * on one scrollable page, against mock data - so it can be opened in a real
 * browser and clicked through, not just seen in a screenshot. Delete this
 * file (and the temporary `export` on JobCard/OfferCard in ../deliveries.tsx)
 * once the review is done - it must never ship.
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Icon } from '../../src/components/Icon';
import { StarRating } from '../../src/components/StarRating';
import { TierBadge } from '../../src/components/TierBadge';
import { MoneyText } from '../../src/components/MoneyText';
import { StatusPill } from '../../src/components/StatusPill';
import { EmptyState, ErrorState } from '../../src/components/Feedback';
import { JobCard, OfferCard } from '../deliveries';
import { colors, spacing, type, radii, fontFamily } from '../../src/theme';
import { avatarGradient } from '../../src/lib/format';
import type { Delivery, DeliveryOffer, Transaction } from '../../src/api/types';

function baseDelivery(over: Partial<Delivery>): Delivery {
  return {
    id: 'preview',
    martOrderId: 'ORD-1',
    storeName: 'Ikeja Fresh Mart',
    taskId: 'task-1',
    items: [
      { name: 'Rice', qty: 2 },
      { name: 'Bread', qty: 1 },
      { name: 'Cooking oil (5L)', qty: 1 },
      { name: 'Tomatoes', qty: 6 },
    ],
    pickupAddress: '14 Awolowo Way, Ikeja, Lagos',
    pickupLat: 6.6018,
    pickupLng: 3.3515,
    goodsTotal: 18500,
    deliveryFee: 1500,
    expectedBy: null,
    status: 'COURIER_ASSIGNED',
    statusLabel: 'Assigned to you',
    preparedAt: new Date().toISOString(),
    pickedUpAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    dropoffAddress: '22 Herbert Macaulay Way, Yaba, Lagos',
    dropoffLat: 6.5095,
    dropoffLng: 3.3711,
    dropoffInstructions: 'Blue gate, ring the bell twice',
    customerName: 'Amaka Obi',
    customerPhone: '+2348012345678',
    customerPurged: false,
    ...over,
  };
}

function baseOffer(over: Partial<DeliveryOffer>): DeliveryOffer {
  return {
    id: 'preview-offer',
    martOrderId: 'ORD-2',
    storeName: 'Ikeja Fresh Mart',
    taskId: null,
    items: [{ name: 'Rice', qty: 2 }, { name: 'Bread', qty: 1 }],
    pickupAddress: '14 Awolowo Way, Ikeja, Lagos',
    pickupLat: 6.6018,
    pickupLng: 3.3515,
    goodsTotal: 8500,
    deliveryFee: 1500,
    expectedBy: null,
    status: 'STORE_ACCEPTED',
    statusLabel: 'Store is packing',
    createdAt: new Date().toISOString(),
    fee: 1500,
    offer: {
      stage: 'OFFERED',
      radiusMetres: 3000,
      waitingMinutes: 0,
      widenings: 0,
      atMaxRadius: false,
      escalated: false,
      label: 'Offered to couriers nearby',
    },
    distanceMetres: 1240,
    distance: '1.2 km',
    claimable: true,
    reason: null,
    blockers: [],
    opensToYouInMinutes: null,
    ...over,
  };
}

const assigned = baseDelivery({});
const pickedUp = baseDelivery({
  id: 'preview-pickedup',
  status: 'PICKED_UP',
  statusLabel: 'Picked up',
  pickedUpAt: new Date().toISOString(),
});
const failed = baseDelivery({
  id: 'preview-failed',
  status: 'FAILED',
  statusLabel: 'Could not deliver',
  pickedUpAt: new Date().toISOString(),
  failedAt: new Date().toISOString(),
  failureReason: 'Nobody at the address after three calls',
});

const claimable = baseOffer({});
const widened = baseOffer({
  id: 'preview-widened',
  storeName: 'Computer Village Electronics',
  fee: 2200,
  distance: '6.4 km',
  items: [{ name: 'Phone charger', qty: 3 }, { name: 'Earphones', qty: 2 }, { name: 'Case', qty: 1 }],
  offer: {
    stage: 'WIDENED',
    radiusMetres: 6000,
    waitingMinutes: 9,
    widenings: 1,
    atMaxRadius: false,
    escalated: false,
    label: 'Offered 9 min ago, circle widened',
  },
});
const blocked = baseOffer({
  id: 'preview-blocked',
  storeName: 'Yaba Tech Hub',
  fee: 1800,
  distance: '9.7 km',
  claimable: false,
  reason: 'You are 9.7 km away; this job is open to couriers within 6.0 km',
  opensToYouInMinutes: 4,
});

// ─── Profile / Wallet mocks (the other two redesigned screens) ────────────────

const mockUser = {
  name: 'Amaka Obi',
  email: 'amaka.obi@email.com',
  tiers: ['DISPATCH', 'REMOTE'] as const,
  rating: 4.8,
  completedCount: 62,
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const mockTxns: Transaction[] = [
  { id: 't1', kind: 'earning', title: 'Task: Data entry batch', amount: 12000, status: 'RELEASED', createdAt: daysAgo(0) },
  { id: 't2', kind: 'earning', title: 'Delivery fee — ORD-118', amount: 1500, status: 'RELEASED', createdAt: daysAgo(0) },
  { id: 't3', kind: 'withdrawal', title: 'Withdrawal to GTBank', amount: 8000, status: 'PAID', createdAt: daysAgo(1) },
  { id: 't4', kind: 'earning', title: 'Task: Store inventory count', amount: 6500, status: 'PENDING', createdAt: daysAgo(1) },
];

function mockTxnGroups() {
  const groups: { key: string; label: string; net: number; items: Transaction[] }[] = [];
  for (const tx of mockTxns) {
    const d = new Date(tx.createdAt);
    const key = d.toDateString();
    const signed = tx.kind === 'withdrawal' ? -tx.amount : tx.amount;
    let group = groups[groups.length - 1]?.key === key ? groups[groups.length - 1] : undefined;
    if (!group) {
      group = {
        key,
        label: d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }),
        net: 0,
        items: [],
      };
      groups.push(group);
    }
    group.net += signed;
    group.items.push(tx);
  }
  return groups;
}

function PreviewTxnRow({ tx }: { tx: Transaction }) {
  const out = tx.kind === 'withdrawal';
  return (
    <View style={devStyles.txRow}>
      <View style={[devStyles.txIcon, { backgroundColor: out ? colors.surfaceSand : colors.moneySoft }]}>
        <Icon name={out ? 'arrow-up' : 'arrow-down'} size={18} color={out ? colors.textMuted : colors.money} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={devStyles.txTitle} numberOfLines={1}>{tx.title}</Text>
      </View>
      <MoneyText amount={tx.amount} size={type.size.md} color={out ? colors.text : colors.money} signed={out ? 'out' : 'in'} />
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export default function DevPreview() {
  return (
    <Screen title="Redesign review">
      <View style={styles.gap}>
        <Heading>Offer card — claimable</Heading>
        <OfferCard o={claimable} at={{ lat: 6.6, lng: 3.35 }} onTaken={() => {}} />

        <Heading>Offer card — widened / waiting</Heading>
        <OfferCard o={widened} at={{ lat: 6.6, lng: 3.35 }} onTaken={() => {}} />

        <Heading>Offer card — blocked</Heading>
        <OfferCard o={blocked} at={{ lat: 6.6, lng: 3.35 }} onTaken={() => {}} />

        <Heading>Job card — assigned (before pickup)</Heading>
        <JobCard d={assigned} onChange={() => {}} />

        <Heading>Job card — picked up (the completion moment)</Heading>
        <JobCard d={pickedUp} onChange={() => {}} />

        <Heading>Job card — failed</Heading>
        <JobCard d={failed} onChange={() => {}} />

        <Heading>Empty state</Heading>
        <EmptyState
          icon="map-pin"
          title="Nothing to carry yet"
          message="Orders appear here as stores accept them. Take one and it is yours straight away."
        />

        <Heading>Error state</Heading>
        <ErrorState message="Could not reach Afrizone. Check your connection and try again." onRetry={() => {}} />

        <Heading>Profile — identity header</Heading>
        <Card style={devStyles.identity}>
          <View style={devStyles.avatarWrap}>
            <LinearGradient
              colors={avatarGradient(mockUser.name)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={devStyles.avatar}
            >
              <Text style={devStyles.avatarText}>
                {mockUser.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </Text>
            </LinearGradient>
            <View style={devStyles.avatarEditBadge}>
              <Icon name="edit" size={13} color={colors.onGold} />
            </View>
          </View>
          <Text style={devStyles.name}>{mockUser.name}</Text>
          <View style={devStyles.tiers}>
            {mockUser.tiers.map((t) => <TierBadge key={t} tier={t} small />)}
          </View>
          <View style={devStyles.ratingBlock}>
            <StarRating score={mockUser.rating} size={13} gap={2} />
            <Text style={devStyles.ratingValue}>
              {mockUser.rating.toFixed(1)} · {mockUser.completedCount} tasks
            </Text>
          </View>
        </Card>

        <Heading>Profile — personal info card</Heading>
        <View style={devStyles.sectionHead}>
          <Text style={devStyles.sectionLabel}>Personal info</Text>
          <Pressable hitSlop={8}>
            <Text style={devStyles.sectionAction}>Edit</Text>
          </Pressable>
        </View>
        <Card style={devStyles.list}>
          <View style={devStyles.infoRow}>
            <Text style={devStyles.infoLabel}>Full name</Text>
            <Text style={devStyles.infoValue}>{mockUser.name}</Text>
          </View>
          <View style={devStyles.divider} />
          <View style={devStyles.infoRow}>
            <Text style={devStyles.infoLabel}>Email</Text>
            <Text style={devStyles.infoValue}>{mockUser.email}</Text>
          </View>
        </Card>

        <Heading>Wallet — period chips + grouped transactions</Heading>
        <View style={devStyles.periodRow}>
          {['This week', 'This month', 'All time'].map((p, i) => (
            <View key={p} style={[devStyles.periodChip, i === 2 && devStyles.periodChipActive]}>
              <Text style={[devStyles.periodChipText, i === 2 && devStyles.periodChipTextActive]}>{p}</Text>
            </View>
          ))}
        </View>
        <Card style={devStyles.list}>
          {mockTxnGroups().map((group, gi) => (
            <View key={group.key}>
              <View style={[devStyles.dayHeader, gi > 0 && devStyles.dayHeaderDivider]}>
                <Text style={devStyles.dayLabel}>{group.label}</Text>
                <MoneyText
                  amount={Math.abs(group.net)}
                  signed={group.net >= 0 ? 'in' : 'out'}
                  size={type.size.sm}
                  color={colors.textMuted}
                  weight="700"
                />
              </View>
              {group.items.map((tx, i) => (
                <View key={tx.id}>
                  <PreviewTxnRow tx={tx} />
                  {i < group.items.length - 1 ? <View style={devStyles.divider} /> : null}
                </View>
              ))}
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 4, paddingBottom: 60 },
  heading: { fontSize: 13, fontWeight: '700', color: '#8a5a0f', marginTop: 18, marginBottom: 2 },
});

// Mirrors the private styles added to profile.tsx / wallet.tsx for this
// review - duplicated rather than exported, since this whole file is
// throwaway (see the top-of-file note).
const devStyles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
  avatarWrap: { marginBottom: spacing.sm },
  avatar: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: type.size.xl, fontFamily: fontFamily.extrabold },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.clay,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: type.size.lg, fontFamily: fontFamily.extrabold, marginTop: spacing.xs },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: spacing.xs },
  ratingBlock: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  ratingValue: { color: colors.text, fontSize: type.size.sm, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: type.size.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionAction: { color: colors.goldInk, fontSize: type.size.sm, fontWeight: '700' },
  list: { paddingHorizontal: spacing.lg },
  infoRow: { paddingVertical: spacing.md, gap: 2 },
  infoLabel: { color: colors.textMuted, fontSize: type.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { color: colors.text, fontSize: type.size.md, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.line },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 99,
    borderColor: colors.line,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  periodChipActive: { backgroundColor: colors.clay, borderColor: colors.clay },
  periodChipText: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  periodChipTextActive: { color: colors.onGold, fontWeight: '700' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  dayHeaderDivider: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  dayLabel: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '700' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  txIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { color: colors.text, fontSize: type.size.base, fontWeight: '700' },
});
