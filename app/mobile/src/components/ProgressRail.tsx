import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, spacing } from '../theme';

/** Stepper progress rail: "3 of 9" + segmented bar (KYC flow §3.1). */
export function ProgressRail({
  current,
  total,
  label,
}: {
  current: number; // 1-based
  total: number;
  label?: string;
}) {
  return (
    <View style={styles.wrap} accessibilityLabel={`Step ${current} of ${total}`}>
      <View style={styles.header}>
        <Text style={styles.count}>
          Step {current} of {total}
        </Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
      <View style={styles.bar}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[styles.segment, i < current ? styles.segmentOn : styles.segmentOff]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: colors.goldInk, fontSize: type.size.sm, fontWeight: '700' },
  label: { color: colors.textMuted, fontSize: type.size.sm },
  bar: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 100 },
  segmentOn: { backgroundColor: colors.clay },
  segmentOff: { backgroundColor: colors.line },
});
