import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing, type, shadow, motif } from '../theme';
import { MoneyText } from './MoneyText';
import { PatternDivider, PatternWatermark } from './Motif';
import type { Wallet } from '../api/types';

/**
 * 3-balance card (Pending / Available / Withdrawn) on a clay→navy brand
 * surface. Numbers come from the REAL derived wallet (GET /api/workers/:id).
 */
export function WalletBalanceCard({ wallet }: { wallet: Wallet }) {
  return (
    <View style={styles.shadowWrap}>
      <View style={styles.card} accessibilityLabel="Wallet balances">
        <LinearGradient
          colors={[colors.clay, colors.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentBar}
        />
        <PatternWatermark color={colors.gold} opacity={motif.watermarkOpacityDark} size={180} style={styles.watermark} />

        <Text style={styles.label}>Available to withdraw</Text>
        <MoneyText
          amount={wallet.available}
          size={type.size.displayLg}
          color={colors.white}
          weight="800"
        />

        <PatternDivider color={colors.gold} opacity={motif.dividerOpacityDark} style={styles.divider} />

        <View style={styles.row}>
          <Balance label="Pending" amount={wallet.pending} />
          <View style={styles.vline} />
          <Balance label="Withdrawn" amount={wallet.withdrawn} />
        </View>
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
  shadowWrap: {
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    ...shadow.card,
  },
  card: {
    backgroundColor: colors.navy,
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    padding: spacing.xl,
    paddingTop: spacing.xl + 3,
    gap: 6,
    overflow: 'hidden',
  },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  watermark: { top: -60, right: -60 },
  label: { color: colors.gold, fontSize: type.size.sm, fontWeight: '600' },
  divider: { marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  balance: { flex: 1, gap: 2 },
  subLabel: { color: 'rgba(255,255,255,0.6)', fontSize: type.size.xs, fontWeight: '600' },
  vline: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: spacing.md },
});
