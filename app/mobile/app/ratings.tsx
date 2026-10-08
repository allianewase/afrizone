import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackHeader, AppEmptyState, AppErrorState, AppLoadingCards } from '../src/appui/AppUI';
import { StarRating } from '../src/components/StarRating';
import { obColors, obRadii } from '../src/onboarding/onboardingTheme';
import { api } from '../src/api/client';
import { useAsync } from '../src/lib/useAsync';
import { useAuth } from '../src/auth/AuthContext';
import { formatDate } from '../src/lib/format';
import type { Rating, User } from '../src/api/types';

/**
 * Restyled onto the navy/gold palette. Both fetches and the fallback from
 * the fresh worker record to the cached auth user are unchanged.
 *
 * StarRating stays shared: its colours are props, so it takes the new gold
 * without touching a component three screens use.
 */
function RatingCard({ r }: { r: Rating }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <StarRating score={r.score} size={15} gap={3} color={obColors.gold} emptyColor={obColors.line} />
        <Text style={styles.score}>{r.score}/5</Text>
      </View>
      <Text style={styles.taskTitle} numberOfLines={2}>{r.task.title}</Text>
      {r.note ? <Text style={styles.note}>{r.note}</Text> : null}
      <Text style={styles.date}>{formatDate(r.createdAt)}</Text>
    </View>
  );
}

function AggregateHeader({ rating, count }: { rating?: number | null; count?: number }) {
  if (rating == null && !count) return null;
  return (
    <View style={styles.aggCard}>
      {rating != null ? (
        <>
          <StarRating score={rating} size={22} gap={5} color={obColors.gold} emptyColor={obColors.line} />
          <Text style={styles.aggScore}>{rating.toFixed(1)}</Text>
          <Text style={styles.aggLabel}>overall rating</Text>
        </>
      ) : null}
      {count ? (
        <Text style={styles.aggCount}>{count} task{count !== 1 ? 's' : ''} rated</Text>
      ) : null}
    </View>
  );
}

export default function RatingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const ratings = useAsync<Rating[]>((signal) => api.myRatings(signal), []);
  const me = useAsync<User>((signal) => api.meWorker(signal), []);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={ratings.loading && !!ratings.data}
            onRefresh={ratings.reload}
            tintColor={obColors.navy}
          />
        }
      >
        <AppBackHeader title="My ratings" onBack={() => router.back()} />
        <Text style={styles.subtitle}>Feedback from task managers</Text>

        {ratings.loading && !ratings.data ? (
          <AppLoadingCards count={2} />
        ) : ratings.error && !ratings.data ? (
          <AppErrorState message={ratings.error} onRetry={ratings.reload} />
        ) : (
          <>
            <AggregateHeader
              rating={me.data?.rating ?? user?.rating}
              count={me.data?.completedCount ?? user?.completedCount}
            />
            {(ratings.data ?? []).length === 0 ? (
              <AppEmptyState
                icon="star"
                title="No ratings yet"
                message="Task managers can rate your performance after each completed task. Keep delivering quality work!"
              />
            ) : (
              <View style={{ gap: 10 }}>
                {(ratings.data ?? []).map((r) => (
                  <RatingCard key={r.id} r={r} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
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
    gap: 4,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  score: { color: obColors.textMut, fontSize: 12.5, fontWeight: '700' },
  taskTitle: { color: obColors.text, fontSize: 14, fontFamily: 'Raleway_800ExtraBold', lineHeight: 19 },
  note: {
    color: obColors.text,
    fontSize: 12.5,
    lineHeight: 18,
    backgroundColor: obColors.sand,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  date: { color: obColors.textMut, fontSize: 11, marginTop: 4 },

  aggCard: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  aggScore: { color: obColors.navy, fontSize: 40, fontFamily: 'Raleway_800ExtraBold', lineHeight: 44, marginTop: 6 },
  aggLabel: { color: obColors.textMut, fontSize: 12.5 },
  aggCount: { color: obColors.textMut, fontSize: 12.5, marginTop: 4 },
});
