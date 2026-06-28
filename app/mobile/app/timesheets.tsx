import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/Card';
import { StatusPill } from '../src/components/StatusPill';
import { LoadingState, ErrorState, EmptyState } from '../src/components/Feedback';
import { colors, spacing, type } from '../src/theme';
import { api } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import { formatDate } from '../src/lib/format';
import type { Timesheet } from '../src/api/types';

const STATUS_MAP: Record<string, { label: string; status: string }> = {
  SUBMITTED: { label: 'Pending',  status: 'PENDING'   },
  APPROVED:  { label: 'Approved', status: 'APPROVED'  },
  DISPUTED:  { label: 'Disputed', status: 'DISPUTED'  },
};

function TimesheetCard({ ts }: { ts: Timesheet }) {
  const cfg = STATUS_MAP[ts.status] ?? { label: ts.status, status: 'PENDING' };
  const h = ts.hours;
  const hoursLabel = `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(2)} hr${h !== 1 ? 's' : ''}`;

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.taskTitle} numberOfLines={2}>{ts.task.title}</Text>
        <StatusPill status={cfg.status as any} small label={cfg.label} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.hours}>{hoursLabel}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.period}>
          {formatDate(ts.periodStart)} – {formatDate(ts.periodEnd)}
        </Text>
      </View>
      <Text style={styles.filed}>Filed {formatDate(ts.createdAt)}</Text>
    </Card>
  );
}

export default function TimesheetsScreen() {
  const timesheets = useAsync<Timesheet[]>((signal) => api.myTimesheets(signal), []);

  return (
    <Screen
      title="Timesheets"
      subtitle="Your submitted hour records"
      back
      onRefresh={timesheets.reload}
      refreshing={timesheets.loading && !!timesheets.data}
    >
      {timesheets.loading && !timesheets.data ? (
        <LoadingState />
      ) : timesheets.error && !timesheets.data ? (
        <ErrorState message={timesheets.error} onRetry={timesheets.reload} />
      ) : (timesheets.data ?? []).length === 0 ? (
        <EmptyState
          title="No timesheets yet"
          message="After clocking out of a task, submit your hours. They'll appear here for approval."
        />
      ) : (
        <View style={styles.list}>
          {(timesheets.data ?? []).map((ts) => (
            <TimesheetCard key={ts.id} ts={ts} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { gap: spacing.xs },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  taskTitle: { flex: 1, color: colors.text, fontSize: type.size.md, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  hours: { color: colors.clay, fontSize: type.size.sm, fontWeight: '700' },
  dot: { color: colors.line, fontSize: type.size.sm },
  period: { color: colors.textMuted, fontSize: type.size.sm, flex: 1 },
  filed: { color: colors.textMuted, fontSize: type.size.xs },
});
