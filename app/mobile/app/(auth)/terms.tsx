import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreen } from '../../src/components/AuthShell';
import { Banner } from '../../src/components/Feedback';
import { colors, spacing, type } from '../../src/theme';

const LAST_UPDATED = '20 August 2026';
const SUPPORT_EMAIL = 'support@afrizonemart.com';

/**
 * Terms of Service: a real first draft describing how Afrizone Part Time
 * actually works, written for the pilot launch - not lawyer-reviewed, so it
 * stays clearly flagged as a draft rather than presented as final legal
 * copy. Have this reviewed by counsel before any wider/public rollout.
 */
export default function TermsScreen() {
  const router = useRouter();

  return (
    <AuthScreen onBack={() => router.back()} title="Terms of Service">
      <Banner
        tone="amber"
        icon="alert"
        title="Draft — pending legal review"
        message="This describes how the app actually works today, but hasn't been reviewed by a lawyer. Have it reviewed before a public launch."
      />

      <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

      <Section title="1. Who can use Afrizone Part Time">
        You must be at least 18 years old and legally able to work in Nigeria to
        register as a worker. You must provide accurate information when you
        register and complete identity verification (KYC), including a
        government-issued ID and a selfie for comparison. We may review your KYC
        submission manually, and some submissions are also checked by an
        automated document-verification service.
      </Section>

      <Section title="2. Tasks, applications, and approval">
        Tasks are posted by Afrizone admins. You may apply to any task that
        matches your verified worker tier. An admin reviews and approves or
        rejects applications; approval isn't guaranteed. Once approved, you're
        expected to complete the task as described, including clocking in and
        out for time-tracked tasks (which may use location to confirm you're at
        the task site) and submitting timesheets for hourly work.
      </Section>

      <Section title="3. Payment and tax">
        Approved and completed work is paid to your in-app wallet as earnings
        become available. By law, a 5% withholding tax (WHT) is deducted from
        your gross earnings before it reaches your wallet balance; your wallet
        always shows the net amount. You can withdraw available funds to a bank
        account you've registered and verified, subject to a minimum withdrawal
        amount shown in the app. Withdrawals are processed by a third-party
        payment provider (Paystack) and aren't instant.
      </Section>

      <Section title="4. Your account and conduct">
        Keep your login credentials and any 2FA/OTP codes private — don't share
        them with anyone. You're responsible for the accuracy of the bank and
        tax information you provide. We may suspend or terminate your account
        for fraudulent activity, providing false information, repeated
        no-shows on accepted tasks, or other conduct that violates these terms.
      </Section>

      <Section title="5. Disputes">
        If you disagree with a payment amount, a rejected application, or
        another decision, you can raise a dispute in the app. We'll review
        disputes and respond, but raising a dispute doesn't guarantee a
        particular outcome.
      </Section>

      <Section title="6. Limitation of liability">
        Afrizone Part Time is provided during an early pilot phase. We do our
        best to keep the service reliable and payments accurate, but we don't
        guarantee the app will always be available or error-free, and we're not
        liable for losses arising from task availability, third-party payment
        delays, or similar circumstances outside our direct control.
      </Section>

      <Section title="7. Changes to these terms">
        We may update these terms as the app develops, especially as it moves
        beyond this pilot phase. We'll do our best to notify you of significant
        changes in the app. Continuing to use Afrizone Part Time after a change
        means you accept the updated terms.
      </Section>

      <Section title="8. Contact">
        Questions about these terms? Reach us at {SUPPORT_EMAIL}.
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
  updated: { color: colors.textMuted, fontSize: type.size.sm },
  section: { gap: spacing.xs },
  heading: { color: colors.text, fontSize: type.size.md, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: type.size.base, lineHeight: 22 },
});
