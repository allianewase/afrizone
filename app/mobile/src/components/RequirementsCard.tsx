/**
 * What this task asks for, and where this worker stands against it.
 *
 * The card exists because "you cannot apply" is not useful on its own. A
 * worker who is blocked needs three things in one place: what is missing, what
 * they already have, and a way to go fix the gap without hunting for the right
 * screen. Every blocker the server sends carries a route, so each unmet row is
 * tappable and lands on the screen that resolves it.
 *
 * The wording is the server's, verbatim. Re-phrasing a blocker here would put
 * a second copy of the rules in the app, and the whole point of the eligibility
 * engine is that there is only one.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from './Card';
import { Icon } from './Icon';
import { colors, spacing, type, radii, fontFamily } from '../theme';
import type { Blocker, Eligibility, TaskRequirements } from '../api/types';

/**
 * Straight to the screen that resolves each blocker, not to the section that
 * contains it. A worker one tap from applying should not have to find the
 * right row in Profile first.
 */
const FIX_ROUTES: Record<NonNullable<Blocker['fix']>, { path: string; label: string }> = {
  skills: { path: '/profile/skills', label: 'Add it' },
  credentials: { path: '/profile/credentials', label: 'Upload' },
  kyc: { path: '/(auth)/kyc', label: 'Verify ID' },
};

export function RequirementsCard({
  requirements,
  eligibility,
}: {
  requirements?: TaskRequirements;
  eligibility?: Eligibility | null;
}) {
  const router = useRouter();
  if (!eligibility) return null;

  // An ungated task has one check - the tier - and saying "Requirements: none"
  // above a single row is noise on every card in the feed.
  const gated =
    !!requirements &&
    (requirements.requiresIdentityVerified ||
      requirements.skills.length > 0 ||
      requirements.credentialTypes.length > 0);
  if (!gated && eligibility.eligible) return null;

  const { blockers, met } = eligibility;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Icon
          name={eligibility.eligible ? 'check-circle' : 'shield'}
          size={16}
          color={eligibility.eligible ? colors.moneyInk : colors.goldInk}
        />
        <Text style={styles.headText}>
          {eligibility.eligible ? 'You can apply for this' : 'Before you can apply'}
        </Text>
      </View>

      {blockers.map((b, i) => {
        const route = b.fix ? FIX_ROUTES[b.fix] : null;
        const row = (
          <View style={[styles.row, styles.rowBad]}>
            <Icon name="alert" size={14} color={colors.dangerInk} />
            <Text style={styles.rowText}>{b.message}</Text>
            {route ? (
              <View style={styles.fix}>
                <Text style={styles.fixText}>{route.label}</Text>
                <Icon name="chevron-right" size={14} color={colors.clay} />
              </View>
            ) : null}
          </View>
        );
        // A blocker with nowhere to go must not look tappable. Tiers are granted
        // by an admin, not applied for, and a row that does nothing when pressed
        // reads as the app being broken.
        return route ? (
          <Pressable
            key={`${b.code}-${b.ref ?? i}`}
            onPress={() => router.push(route.path as never)}
            accessibilityRole="button"
            accessibilityLabel={`${b.message} ${route.label}`}
          >
            {row}
          </Pressable>
        ) : (
          <View key={`${b.code}-${b.ref ?? i}`}>{row}</View>
        );
      })}

      {met.length > 0 ? (
        <>
          {blockers.length > 0 ? <Text style={styles.metTitle}>You already have</Text> : null}
          <View style={styles.metWrap}>
            {met.map((m) => (
              <View key={m} style={styles.metChip}>
                <Icon name="check" size={12} color={colors.moneyInk} />
                <Text style={styles.metText}>{m}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { color: colors.text, fontSize: type.size.base, fontFamily: fontFamily.bold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.input,
    borderWidth: 1,
  },
  rowBad: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  rowText: { flex: 1, color: colors.text, fontSize: type.size.sm, lineHeight: 19 },
  fix: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fixText: { color: colors.clay, fontSize: type.size.sm, fontFamily: fontFamily.bold },
  metTitle: {
    color: colors.textMuted,
    fontSize: type.size.xs,
    fontFamily: fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
  metWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: colors.moneySoft,
  },
  metText: { color: colors.moneyInk, fontSize: type.size.xs, fontFamily: fontFamily.bold },
});
