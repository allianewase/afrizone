import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing, shadow } from '../theme';

/**
 * Card surface. DESIGN DECISION: RN backdrop-blur (expo-blur) adds a native
 * dependency and is GPU-heavy on the cheap field phones this app targets
 * (§0 principle 2). We therefore use a solid white surface with a soft warm
 * shadow + warm hairline: the "warm/glass" look adapted for mobile without
 * the blur cost. (Swap to expo-blur later only for brand moments if desired.)
 *
 * Shape follows the "Sunrise Cut" system: the top-right corner is sharply
 * cut (radii.cut) while the rest stay generously rounded (radii.card):
 * an asymmetric silhouette distinct from the uniform-rounded-rectangle look
 * of most fintech apps.
 */
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Sand-tinted surface instead of white. */
  tinted?: boolean;
  padded?: boolean;
  /** Adds the clay→gold branded edge bar along the top. Use for hero/primary surfaces only. */
  accent?: boolean;
}

export function Card({ children, style, tinted, padded = true, accent }: CardProps) {
  return (
    // Shadow lives on the outer view; the inner view clips (overflow: hidden)
    // so the accent bar respects the cut corner. Shadow + overflow:hidden
    // can't coexist on the same RN view without the shadow being clipped away.
    // `style` is applied to the inner view (matching the pre-existing Card
    // API) so callers overriding padding/background/width behave exactly as
    // before; the outer wrapper only ever carries the shadow + radius.
    <View style={styles.shadowWrap}>
      <View
        style={[
          styles.card,
          { backgroundColor: tinted ? colors.surfaceSand : colors.surface },
          padded && styles.padded,
          style,
        ]}
      >
        {accent && (
          <LinearGradient
            colors={[colors.gold, colors.clayDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentBar}
          />
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    ...shadow.soft,
  },
  card: {
    borderRadius: radii.card,
    borderTopRightRadius: radii.cut,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  padded: { padding: spacing.lg },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
});
