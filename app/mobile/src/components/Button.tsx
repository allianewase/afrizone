import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, layout, type, fontFamily } from '../theme';
import { Icon, IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'premium';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  full?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  full = true,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const v = VARIANTS[variant];
  // Primary CTAs use the clay→gold brand gradient (matching web-admin's
  // .btn-primary) instead of a flat fill: bolder, and keeps the two apps
  // visually consistent. `premium` keeps the same treatment as an alias.
  const isGradient = variant === 'premium' || variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        full && styles.full,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {isGradient && (
        <LinearGradient
          colors={[colors.gold, colors.clayDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Icon name={icon} size={18} color={v.fg} />}
          <Text style={[styles.label, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * `primary` and `premium` label on `onGold`, not white: the gradient runs
 * #FBAC34 to #C98518, where white measures 1.90:1 and 3.06:1. This is the same
 * correction web-admin's .btn-primary carries.
 *
 * `ghost` has no fill, so its label sits on the page and uses the ink variant.
 * The raw gold was 1.90:1 there.
 */
const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: 'transparent', fg: colors.onGold, border: 'transparent' },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.goldInk, border: 'transparent' },
  danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
  premium: { bg: 'transparent', fg: colors.onGold, border: 'transparent' },
};

const styles = StyleSheet.create({
  base: {
    minHeight: layout.hitTarget,
    paddingHorizontal: 18,
    // "Sunrise Cut": sharp top-right corner, rounded elsewhere. Matches Card.
    borderRadius: radii.button,
    borderTopRightRadius: radii.cut,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  full: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: type.size.md, fontFamily: fontFamily.extrabold },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
