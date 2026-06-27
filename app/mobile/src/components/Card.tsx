import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme';

/**
 * Card surface. DESIGN DECISION: RN backdrop-blur (expo-blur) adds a native
 * dependency and is GPU-heavy on the cheap field phones this app targets
 * (§0 principle 2). We therefore use a solid white surface with a soft warm
 * shadow + warm hairline — the "warm/glass" look adapted for mobile without
 * the blur cost. (Swap to expo-blur later only for brand moments if desired.)
 */
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Sand-tinted surface instead of white. */
  tinted?: boolean;
  padded?: boolean;
}

export function Card({ children, style, tinted, padded = true }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tinted ? colors.surfaceSand : colors.surface },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.soft,
  },
  padded: { padding: spacing.lg },
});
