import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/Card';
import { StarRating } from '../src/components/StarRating';
import { LoadingState, ErrorState, EmptyState } from '../src/components/Feedback';
import { colors, spacing, type } from '../src/theme';
import { api } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import { useAuth } from '../src/auth/AuthContext';
import { formatDate } from '../src/lib/format';
import type { Rating } from '../src/api/types';

function RatingCard({ r }: { r: Rating }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardRow}>
        <StarRating score={r.score} size={15} gap={3} />
        <Text style={styles.score}>{r.score}/5</Text>
      </View>
      <Text style={styles.taskTitle} numberOfLines={2}>{r.task.title}</Text>
      {r.note ? <Text style={styles.note}>{r.note}</Text> : null}
      <Text style={styles.date}>{formatDate(r.createdAt)}</Text>
    </Card>
  );
}

function AggregateHeader({ rating, count }: { rating?: number | null; count?: number }) {
  if (rating == null && !count) return null;
  return (
    <Card style={styles.aggCard}>
      {rating != null ? (
        <>
          <StarRating score={rating} size={22} gap={5} />
          <Text style={styles.aggScore}>{rating.toFixed(1)}</Text>
          <Text style={styles.aggLabel}>overall rating</Text>
        </>
      ) : null}
      {count ? (
        <Text style={styles.aggCount}>{count} task{count !== 1 ? 's' : ''} rated</Text>
      ) : null}
    </Card>
  );
}

export default function RatingsScreen() {
  const { user } = useAuth();
  const ratings = useAsync<Rating[]>((signal) => api.myRatings(signal), []);

  return (
    <Screen
      title="My ratings"
      subtitle="Feedback from task managers"
      back
      onRefresh={ratings.reload}
      refreshing={ratings.loading && !!ratings.data}
    >
      {ratings.loading && !ratings.data ? (
        <LoadingState />
      ) : ratings.error && !ratings.data ? (
        <ErrorState message={ratings.error} onRetry={ratings.reload} />
      ) : (
        <>
          <AggregateHeader rating={user?.rating} count={user?.completedCount} />
          {(ratings.data ?? []).length === 0 ? (
            <EmptyState
              title="No ratings yet"
              message="Task managers can rate your performance after each completed task. Keep delivering quality work!"
            />
          ) : (
            <View style={styles.list}>
              {(ratings.data ?? []).map((r) => (
                <RatingCard key={r.id} r={r} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { gap: spacing.xs },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  score: { color: colors.textMuted, fontSize: type.size.sm },
  taskTitle: { color: colors.text, fontSize: type.size.md, fontWeight: '700' },
  note: {
    color: colors.text,
    fontSize: type.size.sm,
    backgroundColor: colors.surfaceSand,
    borderRadius: 8,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  date: { color: colors.textMuted, fontSize: type.size.xs, marginTop: spacing.xs },

  aggCard: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
  },
  aggScore: { color: colors.text, fontSize: 40, fontWeight: '800', lineHeight: 44 },
  aggLabel: { color: colors.textMuted, fontSize: type.size.sm },
  aggCount: { color: colors.textMuted, fontSize: type.size.sm, marginTop: spacing.xs },
});
