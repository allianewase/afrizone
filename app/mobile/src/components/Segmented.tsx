import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radii, type, layout } from '../theme';

interface SegmentedProps<T extends string> {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {opt.label}
              {typeof opt.count === 'number' ? `  ${opt.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSand,
    borderRadius: radii.pill,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    minHeight: layout.hitTarget - 8,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  segActive: { backgroundColor: colors.surface },
  label: { color: colors.textMuted, fontWeight: '600', fontSize: type.size.base },
  labelActive: { color: colors.goldInk, fontWeight: '700' },
});
