import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ObButton, ObCheckCircle, ObPill } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { homeRouteFor } from '../../src/lib/accountType';

/**
 * Onboarding screen 11: the pending-review / rejected outcome. Not a
 * celebratory state - "Done" is a secondary (outline) button, not primary,
 * matching the reference. The instant-verify fast path is a separate screen
 * (verified.tsx); this one only ever renders for PENDING or REJECTED.
 */
export default function SubmittedScreen() {
  const router = useRouter();
  const { state } = useOnboarding();
  const params = useLocalSearchParams<{ status?: string; note?: string }>();
  const rejected = params.status === 'REJECTED';

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <ObCheckCircle tone={rejected ? 'danger' : 'money'} icon={rejected ? 'alert' : 'check'} />
        <Text style={styles.title}>{rejected ? 'Verification not approved' : 'Application submitted'}</Text>
        <Text style={styles.body}>
          {params.note ||
            (rejected
              ? 'Your ID and selfie did not pass automated verification. You can try again from Profile once you have clearer documents.'
              : "We're reviewing your details. This usually takes 24-48 hours.")}
        </Text>
        {!rejected ? <ObPill label="Under review" /> : null}
      </View>

      <View style={styles.footer}>
        <ObButton label="Done" variant="outline" onPress={() => router.replace(homeRouteFor(state.accountType) as never)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg, justifyContent: 'space-between', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { fontSize: 20, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, textAlign: 'center' },
  body: { fontSize: 14, color: obColors.textMut, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  footer: { paddingBottom: 12 },
});
