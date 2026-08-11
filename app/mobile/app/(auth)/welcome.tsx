import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogoMark } from '../../src/components/Logo';
import { Icon } from '../../src/components/Icon';
import { TopoPattern, WaveDivider } from '../../src/components/Motif';
import { colors, spacing, radii, type, layout, fontFamily } from '../../src/theme';

/**
 * Welcome / onboarding screen: colored hero panel + organic wave divider +
 * minimal white content, adapted from a Saad Shaikh onboarding concept
 * (topographic-textured hero, wave-cut divider, underline accent, circular
 * arrow CTA) in Afrizone's own clay/gold palette rather than the original's
 * coral. The rest of the auth flow (sign in/up etc.) keeps its own navy-card
 * look: only this entry screen adopts the new style.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <TopoPattern color={colors.white} opacity={0.16} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.heroTop, { paddingTop: insets.top + spacing.xl }]}>
          <LogoMark size={56} markTone="reversed" />
        </View>
        <WaveDivider color={colors.bg} style={styles.wave} />
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View>
          <Text style={styles.title}>Welcome to Afrizone</Text>
          <View style={styles.underline} />
          <Text style={styles.subtitle}>Made in Africa, delivered worldwide.</Text>
        </View>

        <View>
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            style={({ pressed }) => [styles.ctaRow, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaLabel}>Sign in</Text>
            <View style={styles.ctaCircle}>
              <Icon name="chevron-right" size={22} color={colors.white} />
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/register')}
            accessibilityRole="button"
            style={styles.altRow}
          >
            <Text style={styles.altText}>
              New to Afrizone? <Text style={styles.altLink}>Create an account</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    height: '46%',
    backgroundColor: colors.clay,
    overflow: 'hidden',
  },
  heroTop: { alignItems: 'center' },
  wave: { position: 'absolute', left: 0, right: 0, bottom: -1 },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: type.size.displayLg,
    fontFamily: fontFamily.extrabold,
    letterSpacing: -0.8,
  },
  underline: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.clay,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: type.size.md,
    lineHeight: 22,
    marginTop: spacing.md,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  ctaLabel: { color: colors.text, fontSize: type.size.lg, fontFamily: fontFamily.extrabold },
  ctaCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderTopRightRadius: radii.cut * 3,
    backgroundColor: colors.clay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  altRow: { alignItems: 'center', marginTop: spacing.lg },
  altText: { color: colors.textMuted, fontSize: type.size.base },
  altLink: { color: colors.goldInk, fontWeight: '700' },
});
