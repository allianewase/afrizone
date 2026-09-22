import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ObButton, ObCheckCircle } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { homeRouteFor } from '../../src/lib/accountType';

/**
 * Onboarding screen 12: the fast-path success state, when Smile ID's
 * automated document verification clears instantly (see submitKyc's own
 * comment - this only happens when Smile ID is configured server-side).
 * Most Individuals should expect to land here rather than on submitted.tsx.
 */
export default function VerifiedScreen() {
  const router = useRouter();
  const { state } = useOnboarding();

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <ObCheckCircle tone="money" />
        <Text style={styles.title}>You're verified!</Text>
        <Text style={styles.body}>Your profile is ready. Start browsing tasks near you.</Text>
      </View>

      <View style={styles.footer}>
        <ObButton label="Go to Home" onPress={() => router.replace(homeRouteFor(state.accountType) as never)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.splashBg, justifyContent: 'space-between', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { fontSize: 20, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, textAlign: 'center' },
  body: { fontSize: 14, color: obColors.textMut, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  footer: { paddingBottom: 12 },
});
