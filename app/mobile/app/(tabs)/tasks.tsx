import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppSegmented, AppListCard, AppListRow, AppStatusPill, AppEmptyState, AppErrorState, AppLoadingCards, type AppPillTone } from '../../src/appui/AppUI';
import { Icon } from '../../src/components/Icon';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { api } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import type { Application } from '../../src/api/types';

/**
 * Restyled to match afrizone-mobile-prototype (1).html's My Tasks screen -
 * compact list rows (icon + title/subtitle + status pill), and now the same
 * three tabs as that reference: Active / Completed / Cancelled, not the
 * previous Applied / Active / Completed.
 *
 * This is a real regrouping, not just a relabel: Active now covers
 * everything still "live" - APPLIED (awaiting a decision) AND APPROVED-
 * not-yet-closed (in progress) together, matching the reference's own
 * "Warehouse picker" example (status Applied, shown under its Active tab).
 * Completed is a closed/archived task that was APPROVED. Cancelled is
 * REJECTED, split out on its own instead of lumped into Completed - a
 * rejection isn't a completion, and the reference's own tab name is the
 * more honest one.
 */

type Seg = 'Active' | 'Completed' | 'Cancelled';

function groupApplications(apps: Application[]): Record<Seg, Application[]> {
  const out: Record<Seg, Application[]> = { Active: [], Completed: [], Cancelled: [] };
  for (const a of apps) {
    const closed = a.task?.status === 'CLOSED' || a.task?.status === 'ARCHIVED';
    if (a.status === 'REJECTED') out.Cancelled.push(a);
    else if (a.status === 'APPROVED' && closed) out.Completed.push(a);
    else out.Active.push(a);
  }
  return out;
}

function statusInfo(app: Application): { tone: AppPillTone; label: string; subtitle: string } {
  const t = app.task;
  const completed = t?.status === 'CLOSED' || t?.status === 'ARCHIVED';
  const hasPayment = completed && app.status === 'APPROVED' && !!app.paymentId;

  if (app.status === 'REJECTED') {
    return { tone: 'attn', label: 'Not selected', subtitle: app.reason || 'Application not approved' };
  }
  if (app.status === 'APPLIED') {
    return { tone: 'await', label: 'Awaiting approval', subtitle: 'Applied · awaiting response' };
  }
  if (completed) {
    return hasPayment
      ? { tone: 'paid', label: 'Paid out', subtitle: 'Payment released' }
      : { tone: 'paid', label: 'Completed', subtitle: 'Task completed' };
  }
  return { tone: 'progress', label: 'In progress', subtitle: 'Approved · tap to clock in' };
}

export default function MyTasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<Seg>('Active');
  // REAL: GET /api/me/applications
  const apps = useAsync<Application[]>((signal) => api.myApplications(signal), []);

  const groups = groupApplications(apps.data ?? []);
  const rows = groups[seg];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={apps.loading && !!apps.data} onRefresh={apps.reload} tintColor={obColors.navy} />}
      >
        <Text style={styles.title}>My Tasks</Text>

        <View style={{ marginTop: 14, marginBottom: 18 }}>
          <AppSegmented
            value={seg}
            onChange={setSeg}
            options={[
              { key: 'Active', label: 'Active' },
              { key: 'Completed', label: 'Completed' },
              { key: 'Cancelled', label: 'Cancelled' },
            ]}
          />
        </View>

        {apps.loading && !apps.data ? (
          <AppLoadingCards count={4} />
        ) : apps.error ? (
          <AppErrorState message={apps.error} onRetry={apps.reload} />
        ) : rows.length === 0 ? (
          <AppEmptyState
            icon="list"
            title={`Nothing ${seg.toLowerCase()} yet`}
            message={
              seg === 'Active'
                ? 'Applications you send and tasks you get approved for show up here.'
                : seg === 'Completed'
                  ? 'Finished tasks land here once they close.'
                  : 'Applications an admin didn’t approve land here.'
            }
          />
        ) : (
          <AppListCard>
            {rows.map((a, i) => {
              const info = statusInfo(a);
              const completed = a.task?.status === 'CLOSED' || a.task?.status === 'ARCHIVED';
              const hasPayment = completed && a.status === 'APPROVED' && !!a.paymentId;
              return (
                <View key={a.id}>
                  <AppListRow
                    icon={a.status === 'APPLIED' ? 'clock' : a.status === 'REJECTED' ? 'close' : completed ? 'check-circle' : 'briefcase'}
                    title={a.task?.title ?? 'Task'}
                    subtitle={info.subtitle}
                    onPress={a.status === 'APPROVED' && !completed ? () => router.push(`/active/${a.taskId}`) : () => router.push(`/task/${a.taskId}`)}
                    last={i === rows.length - 1 && !hasPayment}
                    right={<AppStatusPill tone={info.tone} label={info.label} />}
                  />
                  {hasPayment ? (
                    <Pressable
                      style={[styles.paymentLink, i === rows.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => router.push(`/payment/${a.paymentId}`)}
                    >
                      <Icon name="dollar" size={13} color={obColors.mgreen} />
                      <Text style={styles.paymentLinkText}>View payment breakdown</Text>
                      <Icon name="chevron-right" size={13} color={obColors.mgreen} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </AppListCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  title: { fontSize: 19, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy },
  paymentLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: obColors.line,
    backgroundColor: obColors.mgreenBg,
  },
  paymentLinkText: { flex: 1, fontSize: 12, fontWeight: '700', color: obColors.mgreenInk },
});
