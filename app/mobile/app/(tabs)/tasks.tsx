import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Segmented } from '../../src/components/Segmented';
import { StatusPill } from '../../src/components/StatusPill';
import { TierBadge } from '../../src/components/TierBadge';
import { MoneyText } from '../../src/components/MoneyText';
import { Icon } from '../../src/components/Icon';
import { LoadingState, ErrorState, EmptyState } from '../../src/components/Feedback';
import { colors, spacing, type } from '../../src/theme';
import { api } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import type { Application } from '../../src/api/types';

type Seg = 'Applied' | 'Active' | 'Completed';

/**
 * Bucket applications for the segmented control (per API_CONTRACT v3):
 *   Applied   = status APPLIED
 *   Active    = status APPROVED and task not CLOSED/ARCHIVED
 *   Completed = task CLOSED/ARCHIVED (plus REJECTED)
 */
function groupApplications(apps: Application[]): {
  Applied: Application[];
  Active: Application[];
  Completed: Application[];
} {
  const out = {
    Applied: [] as Application[],
    Active: [] as Application[],
    Completed: [] as Application[],
  };
  for (const a of apps) {
    const closed = a.task?.status === 'CLOSED' || a.task?.status === 'ARCHIVED';
    if (closed || a.status === 'REJECTED') out.Completed.push(a);
    else if (a.status === 'APPROVED') out.Active.push(a);
    else out.Applied.push(a);
  }
  return out;
}

export default function MyTasksScreen() {
  const router = useRouter();
  const [seg, setSeg] = useState<Seg>('Applied');
  // REAL: GET /api/me/applications
  const apps = useAsync<Application[]>((signal) => api.myApplications(signal), []);

  const groups = groupApplications(apps.data ?? []);
  const rows = groups[seg];

  return (
    <Screen
      title="My Tasks"
      subtitle="Track your applications and work"
      onRefresh={apps.reload}
      refreshing={apps.loading && !!apps.data}
    >
      <Segmented<Seg>
        value={seg}
        onChange={setSeg}
        options={[
          { key: 'Applied', label: 'Applied', count: groups.Applied.length },
          { key: 'Active', label: 'Active', count: groups.Active.length },
          { key: 'Completed', label: 'Done', count: groups.Completed.length },
        ]}
      />

      <View style={{ height: spacing.lg }} />

      {apps.loading && !apps.data ? (
        <LoadingState />
      ) : apps.error ? (
        <ErrorState message={apps.error} onRetry={apps.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="list"
          title={`Nothing ${seg.toLowerCase()} yet`}
          message={
            seg === 'Applied'
              ? 'Browse Home to find and apply to tasks.'
              : seg === 'Active'
                ? 'Approved tasks will show here — clock in from the task.'
                : 'Completed and closed tasks land here.'
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {rows.map((a) => (
            <ApplicationCard
              key={a.id}
              app={a}
              onPress={
                seg === 'Active' ? () => router.push(`/active/${a.taskId}`) : () => router.push(`/task/${a.taskId}`)
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function ApplicationCard({ app, onPress }: { app: Application; onPress: () => void }) {
  const t = app.task;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <View style={styles.head}>
          {t ? <TierBadge tier={t.tier} small /> : <View />}
          <StatusPill status={app.status} small />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {t?.title ?? 'Task'}
        </Text>
        <View style={styles.foot}>
          {t ? (
            <View style={styles.payRow}>
              <MoneyText
                amount={t.payModel === 'HOURLY' ? t.rate : t.budget ?? t.rate}
                size={type.size.md}
                color={colors.clay}
              />
              <Text style={styles.unit}>{t.payModel === 'HOURLY' ? '/hr' : ' fixed'}</Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.cta}>
            <Text style={styles.ctaText}>
              {app.status === 'APPROVED' ? 'Open & clock in' : 'View'}
            </Text>
            <Icon name="chevron-right" size={16} color={colors.clay} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: type.size.md, fontWeight: '700', marginBottom: spacing.sm },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payRow: { flexDirection: 'row', alignItems: 'baseline' },
  unit: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { color: colors.clay, fontWeight: '700', fontSize: type.size.base },
});
