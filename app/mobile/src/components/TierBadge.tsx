import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../theme';
import type { Tier } from '../api/types';

/** Tier display names + tones. Tiers: Student/Dispatch/Remote/Promo/Trade. */
const TIER_META: Record<Tier, { label: string; color: string; bg: string }> = {
  STUDENT: { label: 'Student', color: colors.indigo, bg: colors.indigoSoft },
  DISPATCH: { label: 'Dispatch', color: colors.clay, bg: colors.claySoft },
  REMOTE: { label: 'Remote', color: colors.forest, bg: colors.forestSoft },
  PROMO: { label: 'Promo', color: colors.gold, bg: colors.amberSoft },
  TRADE: { label: 'Trade', color: colors.money, bg: colors.moneySoft },
};

export function TierBadge({ tier, small }: { tier: Tier; small?: boolean }) {
  const m = TIER_META[tier] ?? { label: tier, color: colors.textMuted, bg: colors.surfaceSand };
  return (
    <View
      style={[styles.badge, { backgroundColor: m.bg }, small && styles.small]}
      accessibilityLabel={`Tier: ${m.label}`}
    >
      <Text style={[styles.text, { color: m.color, fontSize: small ? 11 : 12 }]}>{m.label}</Text>
    </View>
  );
}

export function tierLabel(tier: Tier): string {
  return TIER_META[tier]?.label ?? tier;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
  },
  small: { paddingVertical: 2, paddingHorizontal: 7 },
  text: { fontWeight: '700', letterSpacing: 0.2 },
});
