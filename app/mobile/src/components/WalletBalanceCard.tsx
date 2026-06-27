import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, type, shadow } from '../theme';
import { MoneyText } from './MoneyText';
import type { Wallet } from '../api/types';

/**
 * 3-balance card (Pending / Available / Withdrawn) on a clay→navy brand
 * surface. Numbers come from the REAL derived wallet (GET /api/workers/:id).
 */
export function WalletBalanceCard({ wallet }: { wallet: Wallet }) {
  return (
    <View style={styles.card} accessibilityLabel="Wallet balances">
      <Text style={styles.label}>Available to withdraw</Text>
      <MoneyText
        amount={wallet.available}
        size={type.size.displayLg}
        color={colors.white}
        weight="800"
      />

      <View style={styles.divider} />

      <View style={styles.row}>
        <Balance label="Pending" amount={wallet.pending} />
        <View style={styles.vline} />
        <Balance label="Withdrawn" amount={wallet.withdrawn} />
      </View>
    </View>
  );
}

function Balance({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.balance}>
      <Text style={styles.subLabel}>{label}</Text>
      <MoneyText amount={amount} size={type.size.lg} color={colors.white} weight="700" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.navy,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: 6,
    ...shadow.card,
  },
  label: { color: colors.gold, fontSize: type.size.sm, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  balance: { flex: 1, gap: 2 },
  subLabel: { color: 'rgba(255,255,255,0.6)', fontSize: type.size.xs, fontWeight: '600' },
  vline: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: spacing.md },
});
