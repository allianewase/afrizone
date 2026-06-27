import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Icon } from '../../src/components/Icon';
import { MoneyText } from '../../src/components/MoneyText';
import { LoadingState, EmptyState, Banner } from '../../src/components/Feedback';
import { colors, spacing, type, radii } from '../../src/theme';
import { api } from '../../src/api/client';
import { mock } from '../../src/api/mock';
import { useAsync } from '../../src/lib/useAsync';
import type { Job } from '../../src/api/types';

const EMPLOYMENT_LABEL: Record<Job['employmentType'], string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
};

export default function JobsScreen() {
  // REAL: GET /api/jobs (v2). Falls back to mock if the endpoint isn't enabled.
  const jobs = useAsync<{ rows: Job[]; mocked: boolean }>(async (signal) => {
    try {
      const rows = await api.jobs(signal);
      return { rows, mocked: false };
    } catch {
      const rows = await mock.jobs();
      return { rows, mocked: true };
    }
  }, []);

  const rows = jobs.data?.rows ?? [];
  const open = rows.filter((j) => j.status === 'OPEN');

  return (
    <Screen title="Jobs" subtitle="Full-time & part-time openings" onRefresh={jobs.reload} refreshing={jobs.loading && !!jobs.data}>
      {jobs.data?.mocked ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="indigo" icon="wifi-off" title="Showing sample jobs" message="Live /api/jobs is unreachable; displaying demo openings." />
        </View>
      ) : null}

      {jobs.loading && !jobs.data ? (
        <LoadingState label="Loading openings…" />
      ) : open.length === 0 ? (
        <EmptyState icon="briefcase" title="No openings right now" message="Check back soon — new roles are posted weekly." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {open.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function JobCard({ job }: { job: Job }) {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/job/${job.id}`)}>
      <Card>
        <View style={styles.head}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{EMPLOYMENT_LABEL[job.employmentType]}</Text>
          </View>
          <View style={styles.meta}>
            <Icon name="map-pin" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{job.location}</Text>
          </View>
        </View>
        <Text style={styles.title}>{job.title}</Text>
        <Text style={styles.dept}>{job.department}</Text>
        <Text style={styles.desc} numberOfLines={2}>
          {job.description}
        </Text>
        <View style={styles.foot}>
          {job.salaryMin && job.salaryMax ? (
            <View style={styles.salary}>
              <MoneyText amount={job.salaryMin} size={type.size.md} color={colors.clay} />
              <Text style={styles.salarySep}> – </Text>
              <MoneyText amount={job.salaryMax} size={type.size.md} color={colors.clay} />
              <Text style={styles.perMonth}>/mo</Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.apply}>
            <Text style={styles.applyText}>Apply</Text>
            <Icon name="chevron-right" size={16} color={colors.clay} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  tag: { backgroundColor: colors.indigoSoft, borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: 9 },
  tagText: { color: colors.indigo, fontWeight: '700', fontSize: 11 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: colors.textMuted, fontSize: type.size.sm },
  title: { color: colors.text, fontSize: type.size.lg, fontWeight: '800' },
  dept: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600', marginBottom: spacing.xs },
  desc: { color: colors.text, fontSize: type.size.base, lineHeight: 20, marginBottom: spacing.sm },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  salary: { flexDirection: 'row', alignItems: 'baseline' },
  salarySep: { color: colors.clay, fontWeight: '700' },
  perMonth: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  apply: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  applyText: { color: colors.clay, fontWeight: '700', fontSize: type.size.base },
});
