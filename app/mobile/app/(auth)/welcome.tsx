import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from '../../src/components/Logo';
import { colors, spacing, type, fontFamily } from '../../src/theme';

/**
 * Front door of the auth flow. Navy, per explicit direction - reverting the
 * white/peach attempt, same call as Splash.tsx right before it (this is the
 * screen that shows immediately after Splash's ~1.1s hold, so a still-white
 * welcome screen is what "still white" was actually pointing at).
 * Real brand navy/gold (src/theme.ts), not the onboarding flow's own
 * obColors - those are still the green AgriPlant palette from a few turns
 * ago, which would read as an odd navy+green mix here.
 */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <Logo size={48} tone="dark" tagline overlap />
        <Text style={styles.title}>Let's get started!</Text>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={() => router.push('/(auth)/login')} style={styles.primaryBtn}>
          <LinearGradient
            colors={[colors.gold, colors.clayDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.primaryBtnText}>Have an account? Sign in</Text>
        </Pressable>
        <Text style={styles.forgot} onPress={() => router.push('/(auth)/forgot')}>Forgot password?</Text>
        <Text style={styles.footnote}>
          Don't have an account?{' '}
          <Text style={styles.footnoteLink} onPress={() => router.push('/(auth)/account-type')}>Create account</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, justifyContent: 'space-between', padding: spacing.xl, paddingTop: 80, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  title: { fontSize: type.size.xxl, fontFamily: fontFamily.extrabold, color: colors.white, textAlign: 'center' },
  footer: { gap: spacing.md },
  primaryBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  primaryBtnText: { fontFamily: fontFamily.extrabold, fontSize: type.size.md, color: colors.onGold },
  forgot: { color: colors.railMuted, fontSize: type.size.sm, textAlign: 'center' },
  footnote: { color: colors.railMuted, fontSize: type.size.sm, textAlign: 'center' },
  footnoteLink: { color: colors.gold, fontWeight: '700' },
});
