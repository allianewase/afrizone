import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { TaskCard } from '../../src/components/TaskCard';
import { MoneyText } from '../../src/components/MoneyText';
import { Banner, LoadingState, ErrorState, EmptyState } from '../../src/components/Feedback';
import { colors, spacing, type } from '../../src/theme';
import { api } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { useAuth } from '../../src/auth/AuthContext';
import type { Task, Wallet, Tier } from '../../src/api/types';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  // REAL: GET /api/tasks
  const tasks = useAsync<Task[]>((signal) => api.tasks(signal), []);
  // REAL: GET /api/me/wallet (earnings snapshot)
  const walletQ = useAsync<Wallet>((signal) => api.myWallet(signal), []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const wallet = walletQ.data ?? { pending: 0, available: 0, withdrawn: 0 };
  const myTiers: Tier[] = user?.tiers ?? [];
  const kycStatus = user?.kycStatus;
  const kycInReview = kycStatus === 'PENDING' || kycStatus === 'VERIFIED';
  const kycIncomplete = user ? kycStatus !== 'TIER_APPROVED' : false;

  const open = (tasks.data ?? []).filter((t) => t.status === 'OPEN');
  const matched = open.filter((t) => myTiers.includes(t.tier));
  const others = open.filter((t) => !myTiers.includes(t.tier));

  return (
    <Screen
      title={`Hi, ${firstName}`}
      subtitle="Let’s find you work today"
      onRefresh={() => {
        tasks.reload();
        walletQ.reload();
      }}
      refreshing={tasks.loading && !!tasks.data}
    >
      {/* Earnings snapshot — REAL wallet */}
      <Card style={styles.snapshot}>
        <View style={styles.snapRow}>
          <View style={styles.snapItem}>
            <Text style={styles.snapLabel}>Available</Text>
            <MoneyText amount={wallet.available} size={type.size.xl} color={colors.money} />
          </View>
          <View style={styles.vline} />
          <View style={styles.snapItem}>
            <Text style={styles.snapLabel}>Pending</Text>
            <MoneyText amount={wallet.pending} size={type.size.xl} color={colors.amber} />
          </View>
        </View>
      </Card>

      {kycInReview ? (
        <View style={{ marginTop: spacing.lg }}>
          <Banner
            tone="indigo"
            icon="shield"
            title="Verification in review"
            message="An admin is reviewing your details. Applying to tasks unlocks once your tier is approved."
          />
        </View>
      ) : kycIncomplete ? (
        <View style={{ marginTop: spacing.lg }}>
          <Banner
            tone="amber"
            icon="shield"
            title="Finish verification to apply"
            message={`KYC status: ${kycStatus ?? 'PENDING'}. Task applications unlock at Tier-Approved.`}
            action="Verify"
            onAction={() => router.push('/(auth)/kyc')}
          />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Matched for you</Text>
      {tasks.loading && !tasks.data ? (
        <LoadingState label="Loading tasks…" />
      ) : tasks.error ? (
        <ErrorState message={tasks.error} onRetry={tasks.reload} />
      ) : matched.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title="No matched tasks yet"
          message="Add a tier in Profile to see tasks matched to your skills."
        />
      ) : (
        <View style={styles.feed}>
          {matched.map((t) => (
            <TaskCard key={t.id} task={t} onPress={() => router.push(`/task/${t.id}`)} />
          ))}
        </View>
      )}

      {others.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>All open tasks</Text>
          <View style={styles.feed}>
            {others.map((t) => (
              <TaskCard key={t.id} task={t} onPress={() => router.push(`/task/${t.id}`)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  snapshot: { backgroundColor: colors.surface },
  snapRow: { flexDirection: 'row', alignItems: 'center' },
  snapItem: { flex: 1, gap: 4 },
  snapLabel: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  vline: { width: 1, height: 36, backgroundColor: colors.line, marginHorizontal: spacing.lg },
  sectionTitle: {
    color: colors.text,
    fontSize: type.size.lg,
    fontWeight: '800',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  feed: { gap: spacing.md },
});
