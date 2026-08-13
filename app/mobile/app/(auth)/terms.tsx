import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreen } from '../../src/components/AuthShell';
import { Banner } from '../../src/components/Feedback';
import { colors, spacing, type } from '../../src/theme';

/**
 * Placeholder Terms of Service: no real legal copy exists for Afrizone yet.
 * Content here is filler, clearly marked as such, so the app doesn't ship
 * with fabricated legal text mistakeable for the real thing.
 */
export default function TermsScreen() {
  const router = useRouter();

  return (
    <AuthScreen onBack={() => router.back()} title="Terms of Service">
      <Banner
        tone="amber"
        icon="alert"
        title="Placeholder content"
        message="This is filler text, not Afrizone's real Terms of Service. Replace it with actual legal copy before launch."
      />

      <Section title="1. Using Afrizone">
        Placeholder: describe who can use the platform, account eligibility, and
        acceptable use of the app.
      </Section>
      <Section title="2. Tasks and payments">
        Placeholder: describe how task applications, approvals, payouts, and
        withholding tax work, and what happens in a dispute.
      </Section>
      <Section title="3. Your account">
        Placeholder: describe account responsibilities, verification (KYC)
        requirements, and grounds for suspension.
      </Section>
      <Section title="4. Changes to these terms">
        Placeholder: describe how and when these terms may be updated, and how
        workers will be notified.
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
