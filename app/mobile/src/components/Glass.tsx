import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing, shadow } from '../theme';

/**
 * Frosted-glass surface: reserved for "brand moment" screens (KYC stepper)
 * per DESIGN_SPEC.md §1.5 ("restrained: this is fintech, not glass" is the
 * default; this is the documented escape hatch, see Card.tsx). Built on the
 * same warm sand/clay/gold palette so it reads as Afrizone-glass, not
 * generic frosted-white.
 */
export type GlassTone = 'neutral' | 'clay' | 'gold' | 'indigo' | 'money' | 'danger';

const TONE_GRADIENT: Record<GlassTone, [string, string]> = {
  neutral: ['rgba(255,255,255,0.60)', 'rgba(255,255,255,0.24)'],
  clay: ['rgba(194,80,46,0.20)', 'rgba(255,255,255,0.30)'],
  gold: ['rgba(233,162,59,0.24)', 'rgba(255,255,255,0.30)'],
  indigo: ['rgba(45,91,168,0.18)', 'rgba(255,255,255,0.30)'],
  money: ['rgba(31,157,107,0.18)', 'rgba(255,255,255,0.30)'],
  danger: ['rgba(200,69,58,0.18)', 'rgba(255,255,255,0.30)'],
};

const TONE_BORDER: Record<GlassTone, string> = {
  neutral: 'rgba(255,255,255,0.55)',
  clay: 'rgba(194,80,46,0.45)',
  gold: 'rgba(233,162,59,0.55)',
  indigo: 'rgba(45,91,168,0.40)',
  money: 'rgba(31,157,107,0.40)',
  danger: 'rgba(200,69,58,0.40)',
};

interface GlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  tone?: GlassTone;
  radius?: number;
  padded?: boolean;
}

export function GlassCard({
  children,
  style,
  contentStyle,
  tone = 'neutral',
  radius = radii.card,
  padded = true,
}: GlassCardProps) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, shadow.soft, style]}>
      <BlurView
        intensity={Platform.OS === 'android' ? 80 : 40}
        tint="light"
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={TONE_GRADIENT[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: radius, borderWidth: 1.5, borderColor: TONE_BORDER[tone] },
        ]}
      />
      <View style={[padded && styles.padded, contentStyle]}>{children}</View>
    </View>
  );
}

/**
 * Soft blurred brand-color glows behind a glass screen's content: the
 * "Adinkra motif at low opacity" principle (§1.5), rendered as gradient
 * blobs instead of geometry. Sits behind the ScrollView; pointerEvents none.
 */
export function GlassBackdrop() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={['rgba(233,162,59,0.22)', 'rgba(233,162,59,0)']}
        style={[styles.blob, { top: -90, right: -70, width: 280, height: 280 }]}
      />
      <LinearGradient
        colors={['rgba(194,80,46,0.16)', 'rgba(194,80,46,0)']}
        style={[styles.blob, { top: 220, left: -100, width: 260, height: 260 }]}
      />
      <LinearGradient
        colors={['rgba(45,91,168,0.10)', 'rgba(45,91,168,0)']}
        style={[styles.blob, { bottom: -60, right: -40, width: 240, height: 240 }]}
      />
    </View>
  );
}

/** Frosted glass bar for a fixed header/footer (blur + hairline edge). */
export function GlassBar({
  children,
  style,
  edge = 'bottom',
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edge?: 'top' | 'bottom';
}) {
  return (
    <View style={[styles.barWrap, edge === 'top' ? styles.barEdgeTop : styles.barEdgeBottom, style]}>
      <BlurView
        intensity={Platform.OS === 'android' ? 90 : 50}
        tint="light"
        style={StyleSheet.absoluteFill}
      />
      <View style={StyleSheet.absoluteFillObject} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing.lg },
  blob: { position: 'absolute', borderRadius: 999 },
  barWrap: { overflow: 'hidden' },
  barEdgeBottom: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.5)' },
  barEdgeTop: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.5)' },
});
