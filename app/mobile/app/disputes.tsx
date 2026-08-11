import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/Card';
import { Segmented } from '../src/components/Segmented';
import { Icon } from '../src/components/Icon';
import { LoadingState, ErrorState, EmptyState } from '../src/components/Feedback';
import { colors, spacing, type, radii } from '../src/theme';
import { api } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import { formatDate } from '../src/lib/format';
import type { Dispute } from '../src/api/types';

type Seg = 'Open' | 'Resolved';

const STATUS_CONFIG: Record<
  Dispute['status'],
  { label: string; color: string; bg: string; icon: 'clock' | 'check-circle' | 'close' }
> = {
  OPEN:     { label: 'Under review',   color: colors.amber,  bg: colors.amberSoft,  icon: 'clock' },
  RESOLVED: { label: 'Resolved',       color: colors.moneyInk,  bg: colors.moneySoft,  icon: 'check-circle' },
  CLOSED:   { label: 'Closed',         color: colors.textMuted, bg: colors.surface, icon: 'close' },
};

export default function DisputesScreen() {
  const [seg, setSeg] = useState<Seg>('Open');
  const disputes = useAsync<Dispute[]>((signal) => api.myDisputes(signal), []);

  const all = disputes.data ?? [];
  const rows = all.filter((d) =>
    seg === 'Open' ? d.status === 'OPEN' : d.status === 'RESOLVED' || d.status === 'CLOSED'
  );

  return (
    <Screen
      title="Disputes"
      subtitle="Payment and timesheet issues"
      back
      onRefresh={disputes.reload}
      refreshing={disputes.loading && !!disputes.data}
    >
      <Segmented<Seg>
        value={seg}
        onChange={setSeg}
        options={[
          { key: 'Open',     label: 'Open',     count: all.filter((d) => d.status === 'OPEN').length },
          { key: 'Resolved', label: 'Resolved', count: all.filter((d) => d.status !== 'OPEN').length },
        ]}
      />

      <View style={{ height: spacing.lg }} />

      {disputes.loading && !disputes.data ? (
        <LoadingState />
      ) : disputes.error ? (
        <ErrorState message={disputes.error} onRetry={disputes.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="shield"
          title={seg === 'Open' ? 'No open disputes' : 'No resolved disputes'}
          message={
            seg === 'Open'
              ? 'Disputes you raise on payments appear here while under review.'
              : 'Resolved disputes will appear here once an admin closes them.'
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {rows.map((d) => <DisputeCard key={d.id} dispute={d} />)}
        </View>
      )}
    </Screen>
  );
}

function DisputeCard({ dispute: d }: { dispute: Dispute }) {
  const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.OPEN;
  const router = useRouter();
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.entityType}>
          <Icon name="id" size={14} color={colors.textMuted} />
          <Text style={styles.entityTypeText}>
            {d.entityType === 'PAYMENT' ? 'Payment' : 'Timesheet'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
          <Icon name={cfg.icon} size={12} color={cfg.color} strokeWidth={2.4} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {d.entity?.title ?? 'Payment dispute'}
      </Text>

      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>Your report</Text>
        <Text style={styles.reasonText}>{d.reason}</Text>
      </View>

      {d.resolution ? (
        <View style={styles.resolutionBox}>
          <View style={styles.resolutionHeader}>
            <Icon name="check-circle" size={14} color={colors.money} />
            <Text style={styles.resolutionLabel}>Admin response</Text>
          </View>
          <Text style={styles.resolutionText}>{d.resolution}</Text>
        </View>
      ) : d.status === 'OPEN' ? (
        <Text style={styles.pendingNote}>
          Our team typically responds within 2 business days.
        </Text>
      ) : null}

      <View style={styles.bottom}>
        <Text style={styles.date}>Filed {formatDate(d.createdAt)}</Text>
        <Pressable
          style={styles.entityLink}
          onPress={() =>
            d.entityType === 'PAYMENT'
              ? router.push(`/payment/${d.entityId}`)
              : router.push('/timesheets')
          }
          accessibilityRole="button"
        >
          <Icon name={d.entityType === 'PAYMENT' ? 'dollar' : 'clock'} size={13} color={colors.clay} />
          <Text style={styles.entityLinkText}>
            {d.entityType === 'PAYMENT' ? 'View payment' : 'View timesheets'}
          </Text>
          <Icon name="chevron-right" size={13} color={colors.clay} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entityType: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  entityTypeText: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  title: { color: colors.text, fontSize: type.size.md, fontWeight: '700' },
  reasonBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 4,
  },
  reasonLabel: { color: colors.textMuted, fontSize: type.size.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonText: { color: colors.text, fontSize: type.size.sm, lineHeight: 18 },
  resolutionBox: {
    backgroundColor: colors.moneySoft,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 6,
  },
  resolutionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resolutionLabel: { color: colors.moneyInk, fontSize: type.size.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  resolutionText: { color: colors.text, fontSize: type.size.sm, lineHeight: 18 },
  pendingNote: { color: colors.textMuted, fontSize: type.size.xs, fontStyle: 'italic' },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  date: { color: colors.textMuted, fontSize: type.size.xs },
  entityLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entityLinkText: { color: colors.goldInk, fontSize: type.size.xs, fontWeight: '700' },
});
