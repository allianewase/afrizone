import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogoMark } from '../../src/components/Logo';
import { Icon } from '../../src/components/Icon';
import { PatternWatermark } from '../../src/components/Motif';
import { colors, spacing, radii, type, layout, motif } from '../../src/theme';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      {/* decorative brand glow */}
      <View style={styles.glowGold} pointerEvents="none" />
      <View style={styles.glowClay} pointerEvents="none" />
      <PatternWatermark
        color={colors.goldBright}
        opacity={motif.watermarkOpacityDark}
        size={420}
        style={styles.watermark}
      />

      <View style={styles.center}>
        <LogoMark size={92} />
        <Text style={styles.title}>
          Afrizone <Text style={styles.titleGold}>Part Time</Text>
        </Text>
        <Text style={styles.body}>Made in Africa, delivered worldwide.</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable
          onPress={() => router.push('/(auth)/login')}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>Sign In</Text>
          <Icon name="chevron-right" size={20} color={colors.navy} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(auth)/register')}
          accessibilityRole="button"
          accessibilityLabel="Sign up"
          style={({ pressed }) => [styles.ctaOutline, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaOutlineText}>Sign Up</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, overflow: 'hidden' },
  glowGold: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.gold,
    opacity: 0.16,
  },
  glowClay: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: colors.clay,
    opacity: 0.18,
  },
  watermark: {
    top: '50%',
    left: '50%',
    marginTop: -210,
    marginLeft: -210,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    color: colors.white,
    fontSize: type.size.displayLg,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 42,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  titleGold: { color: colors.goldBright },
  body: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: type.size.md,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 340,
  },
  footer: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 54,
    borderRadius: radii.button,
    borderTopRightRadius: radii.cut,
    backgroundColor: colors.goldBright,
  },
  ctaOutline: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderRadius: radii.button,
    borderTopRightRadius: radii.cut,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: colors.navy, fontSize: type.size.lg, fontWeight: '800' },
  ctaOutlineText: { color: colors.white, fontSize: type.size.lg, fontWeight: '700' },
});
