import React from 'react';
import { Text, StyleSheet, TextStyle, Platform } from 'react-native';
import { colors, type } from '../theme';
import { formatNaira } from '../lib/format';

interface MoneyTextProps {
  amount: number | null | undefined;
  size?: number;
  color?: string;
  weight?: TextStyle['fontWeight'];
  style?: TextStyle;
  /** Prefix with +/- (for transaction rows). */
  signed?: 'in' | 'out';
}

/**
 * Tabular money rendering in ₦, whole-Naira integers. Uses tabular figures so
 * balances align (§1.4). RN exposes this via `fontVariant: ['tabular-nums']`.
 */
export function MoneyText({
  amount,
  size = type.size.md,
  color = colors.text,
  weight = '700',
  style,
  signed,
}: MoneyTextProps) {
  const prefix = signed === 'in' ? '+' : signed === 'out' ? '−' : '';
  return (
    <Text
      style={[styles.money, { fontSize: size, color, fontWeight: weight }, style]}
      accessibilityRole="text"
    >
      {prefix}
      {formatNaira(amount)}
    </Text>
  );
}

const styles = StyleSheet.create({
  money: {
    // tabular-nums keeps digit columns aligned across rows
    fontVariant: Platform.OS === 'web' ? undefined : (['tabular-nums'] as const),
  },
});
