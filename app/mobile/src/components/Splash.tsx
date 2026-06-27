import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Logo from './Logo';
import { colors, spacing, type } from '../theme';

/**
 * Branded full-screen splash shown while the session + first-launch flag load
 * (AuthGate). Matches the welcome screen's navy/gold treatment so the launch →
 * splash → welcome/sign-in sequence feels continuous.
 */
export default function Splash() {
  return (
    <View style={styles.root} accessibilityLabel="Loading Afrizone" accessibilityRole="progressbar">
      <View style={styles.glowGold} pointerEvents="none" />
      <View style={styles.glowClay} pointerEvents="none" />
      <View style={styles.inner}>
        <Logo size={54} tone="dark" tagline />
        <ActivityIndicator color={colors.goldBright} size="large" style={{ marginTop: spacing.xl }} />
      </View>
      <Text style={styles.caption}>Honest, flexible work across Africa</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
  inner: { alignItems: 'center' },
  caption: {
    position: 'absolute',
    bottom: 56,
    color: 'rgba(255,255,255,0.5)',
    fontSize: type.size.sm,
    fontWeight: '500',
  },
});
