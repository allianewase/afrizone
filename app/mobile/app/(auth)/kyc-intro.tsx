import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { ObScreen } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';

const REQUIREMENTS = [
  'Government-issued ID',
  'Quick selfie & liveness check',
  'Phone number already verified',
];

/**
 * Onboarding screen 06, "Verify your identity" - shared by every account
 * type. Store and Courier owners are verified as people too, not just their
 * business/vehicle, which the role-specific screens handle separately after
 * this.
 */
export default function KycIntroScreen() {
  const router = useRouter();

  return (
    <ObScreen
      onBack={() => router.back()}
      eyebrow="Trust & safety"
      title="Verify your identity"
      subtitle="This unlocks tasks and keeps AZM Stores & customers safe. Takes about 5 minutes."
      primaryLabel="Start verification"
      onPrimary={() => router.push('/(auth)/choose-tier')}
    >
      <View style={styles.list}>
        {REQUIREMENTS.map((r) => (
          <View key={r} style={styles.row}>
            <Icon name="check-circle" size={15} color={obColors.mgreen} />
            <Text style={styles.rowText}>{r}</Text>
          </View>
        ))}
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowText: { color: obColors.text, fontSize: 14, flex: 1, lineHeight: 19 },
});
