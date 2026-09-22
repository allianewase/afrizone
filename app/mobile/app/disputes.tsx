import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppBackHeader, AppSegmented, AppEmptyState, AppErrorState, AppLoadingCards } from '../src/appui/AppUI';
import { Icon } from '../src/components/Icon';
import { obColors, obRadii } from '../src/onboarding/onboardingTheme';
import { api } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import { formatDate } from '../src/lib/format';
import type { Dispute } from '../src/api/types';

type Seg = 'Open' | 'Resolved';

/**
 * Restyled to the same obColors/obRadii shell as the rest of the app. All
 * real logic (open/resolved split, fetch, entity link to payment/timesheets)
 * is unchanged from before.
 *
 * CLOSED gets its own small neutral pill rather than AppStatusPill: that
 * component's six tones (await/progress/review/ready/paid/attn) are all
 * "something is happening" colors, and a closed-without-resolution dispute
 * genuinely isn't any of them - forcing it into the nearest tone would say
 * something false about its state.
 */
const STATUS_CONFIG: Record<Dispute['status'], { label: string; fg: string; bg: string; icon: 'clock' | 'check-circle' | 'close' }> = {
  OPEN: { label: 'Under review', fg: obColors.indigo, bg: obColors.indigoBg, icon: 'clock' },
  RESOLVED: { label: 'Resolved', fg: obColors.mgreen, bg: obColors.mgreenBg, icon: 'check-circle' },
  CLOSED: { label: 'Closed', fg: obColors.textMut, bg: obColors.sand, icon: 'close' },
};

export default function DisputesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<Seg>('Open');
  const disputes = useAsync<Dispute[]>((signal) => api.myDisputes(signal), []);

  const all = disputes.data ?? [];
  const openCount = all.filter((d) => d.status === 'OPEN').length;
  const resolvedCount = all.filter((d) => d.status !== 'OPEN').length;
  const rows = all.filter((d) =>
    seg === 'Open' ? d.status === 'OPEN' : d.status === 'RESOLVED' || d.status === 'CLOSED'
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={disputes.loading && !!disputes.data} onRefresh={disputes.reload} tintColor={obColors.navy} />}
      >
        <AppBackHeader title="Disputes" onBack={() => router.back()} />
        <Text style={styles.subtitle}>Payment and timesheet issues</Text>

        <AppSegmented<Seg>
          value={seg}
          onChange={setSeg}
          options={[
            { key: 'Open', label: `Open · ${openCount}` },
            { key: 'Resolved', label: `Resolved · ${resolvedCount}` },
          ]}
        />

        <View style={{ height: 16 }} />

        {disputes.loading && !disputes.data ? (
          <AppLoadingCards count={2} />
        ) : disputes.error ? (
          <AppErrorState message={disputes.error} onRetry={disputes.reload} />
        ) : rows.length === 0 ? (
          <AppEmptyState
            icon="shield"
            title={seg === 'Open' ? 'No open disputes' : 'No resolved disputes'}
            message={
              seg === 'Open'
                ? 'Disputes you raise on payments appear here while under review.'
                : 'Resolved disputes will appear here once an admin closes them.'
            }
          />
        ) : (
          <View style={{ gap: 12 }}>
            {rows.map((d) => <DisputeCard key={d.id} dispute={d} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DisputeCard({ dispute: d }: { dispute: Dispute }) {
  const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.OPEN;
  const router = useRouter();
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.entityType}>
          <Icon name="id" size={14} color={obColors.textMut} />
          <Text style={styles.entityTypeText}>
            {d.entityType === 'PAYMENT' ? 'Payment' : 'Timesheet'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
          <Icon name={cfg.icon} size={12} color={cfg.fg} strokeWidth={2.4} />
          <Text style={[styles.statusText, { color: cfg.fg }]}>{cfg.label}</Text>
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
            <Icon name="check-circle" size={14} color={obColors.mgreen} />
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
          <Icon name={d.entityType === 'PAYMENT' ? 'dollar' : 'clock'} size={13} color={obColors.goldDeep} />
          <Text style={styles.entityLinkText}>
            {d.entityType === 'PAYMENT' ? 'View payment' : 'View timesheets'}
          </Text>
          <Icon name="chevron-right" size={13} color={obColors.goldDeep} />
        </Pressable>
      </View>
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
    gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entityType: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  entityTypeText: { color: obColors.textMut, fontSize: 12.5, fontWeight: '600' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: obRadii.pill },
  statusText: { fontSize: 11, fontWeight: '700' },
  title: { color: obColors.text, fontSize: 14.5, fontFamily: 'Raleway_800ExtraBold' },
  reasonBox: { backgroundColor: obColors.sand, borderRadius: 12, padding: 12, gap: 4 },
  reasonLabel: { color: obColors.textMut, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonText: { color: obColors.text, fontSize: 12.5, lineHeight: 18 },
  resolutionBox: { backgroundColor: obColors.mgreenBg, borderRadius: 12, padding: 12, gap: 6 },
  resolutionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resolutionLabel: { color: obColors.mgreen, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  resolutionText: { color: obColors.text, fontSize: 12.5, lineHeight: 18 },
  pendingNote: { color: obColors.textMut, fontSize: 11.5, fontStyle: 'italic' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, flexWrap: 'wrap', gap: 8 },
  date: { color: obColors.textMut, fontSize: 11 },
  entityLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entityLinkText: { color: obColors.goldDeep, fontSize: 11.5, fontWeight: '700' },
});
