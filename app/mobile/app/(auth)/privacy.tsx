import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreen } from '../../src/components/AuthShell';
import { Banner } from '../../src/components/Feedback';
import { colors, spacing, type } from '../../src/theme';

/**
 * Placeholder Privacy Policy: no real policy exists for Afrizone yet.
 * Content here is filler, clearly marked as such, so the app doesn't ship
 * with fabricated legal text mistakeable for the real thing.
 */
export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <AuthScreen onBack={() => router.back()} title="Privacy Policy">
      <Banner
        tone="amber"
        icon="alert"
        title="Placeholder content"
        message="This is filler text, not Afrizone's real Privacy Policy. Replace it with actual legal copy before launch."
      />

      <Section title="1. What we collect">
        Placeholder: describe the account, KYC document, location, and payment
        data collected from workers.
      </Section>
      <Section title="2. How we use it">
        Placeholder: describe how data is used for task matching, identity
        verification, payouts, and tax reporting.
      </Section>
      <Section title="3. Who we share it with">
        Placeholder: describe any third parties (KYC providers, payment
        processors, SMS providers) data is shared with, and why.
      </Section>
      <Section title="4. Your choices">
        Placeholder: describe how workers can access, correct, or request
        deletion of their data.
      </Section>
    </AuthScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  heading: { color: colors.text, fontSize: type.size.md, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: type.size.base, lineHeight: 22 },
});
