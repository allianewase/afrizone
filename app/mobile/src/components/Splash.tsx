import { View, ActivityIndicator, StyleSheet } from 'react-native';
import Logo from './Logo';
import { colors } from '../theme';

/**
 * Branded full-screen splash shown while the session + first-launch flag
 * load (AuthGate). Navy ground, per explicit direction - reverting the
 * earlier white/mint attempt. docs/design-decisions.md already covers why
 * navy is correct here: the mark's cart sits navy-on-orange regardless of
 * what's behind it, and its own reversed variant note says outright "the
 * default [mark] variant is correct on the navy rail and the navy splash."
 * tone="dark" pairs it with a white wordmark, the correct half of that pair.
 */
export default function Splash() {
  return (
    <View style={styles.root} accessibilityLabel="Loading Afrizone" accessibilityRole="progressbar">
      <View style={styles.inner}>
        <Logo size={60} tone="dark" tagline overlap />
        <ActivityIndicator color={colors.gold} size="large" style={{ marginTop: 28 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center' },
});
