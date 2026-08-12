import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, type, shadow, fontFamily } from '../theme';
import { Icon, IconName } from './Icon';
import { formatNaira } from '../lib/format';

interface KpiCardProps {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  /** Low-opacity corner glow, echoing iconColor at card scale. */
  glowColor: string;
  label: string;
  value: number;
  /** Format as ₦ (money) vs a plain rounded number (e.g. a rating, a count). */
  money?: boolean;
  decimals?: number;
}

/**
 * Mobile counterpart to web-admin's dashboard KpiCard: icon chip + label +
 * big number, with a soft color wash in the corner instead of web's
 * `filter: blur()` (no expo-blur dependency, same reasoning as Card.tsx).
 */
export function KpiCard({ icon, iconColor, iconBg, glowColor, label, value, money, decimals = 0 }: KpiCardProps) {
  const displayValue = money ? formatNaira(value) : value.toFixed(decimals);
  return (
    <View style={styles.shadowWrap}>
      <View style={styles.card}>
        <View style={[styles.glow, { backgroundColor: glowColor }]} />
        <View style={styles.head}>
          <View style={[styles.iconChip, { backgroundColor: iconBg }]}>
            <Icon name={icon} size={18} color={iconColor} />
          </View>
        </View>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {displayValue}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    flex: 1,
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    ...shadow.soft,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    top: -30,
    right: -24,
    opacity: 0.14,
  },
  head: { flexDirection: 'row' },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.textMuted, fontSize: type.size.xs, fontWeight: '600', marginTop: spacing.sm },
  value: { color: colors.text, fontSize: type.size.xl, fontFamily: fontFamily.extrabold, marginTop: 2 },
});
