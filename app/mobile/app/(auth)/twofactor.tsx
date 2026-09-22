import React, { useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CodeInput } from '../../src/components/CodeInput';
import { Banner } from '../../src/components/Feedback';
import { ObScreen } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useAuth } from '../../src/auth/AuthContext';

const CODE_LEN = 6;

/**
 * Two-factor challenge. Reached from the sign-in hub when /api/auth/login
 * returns {requires2fa, challenge}. Dev bypass `000000` (NODE_ENV !== prod).
 * On success: new/never-completed → onboarding, else tabs.
 *
 * Moved from AuthShell to ObScreen, which is what every other screen in this
 * stack uses. AuthShell was the navy-hero-and-wave-divider shell from an
 * earlier design pass and this was its last caller.
 */
export default function TwoFactorScreen() {
  const router = useRouter();
  const { verifyTwoFactor } = useAuth();
  const params = useLocalSearchParams<{ challenge?: string }>();
  const challenge = typeof params.challenge === 'string' ? params.challenge : '';

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onVerify(value?: string) {
    const c = value ?? code;
    if (c.length !== CODE_LEN || busy || !challenge) return;
    setBusy(true);
    setError(null);
    try {
      const isNewUser = await verifyTwoFactor(challenge, c);
      router.replace(isNewUser ? '/(auth)/personal-details' : '/(tabs)/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is wrong or expired.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ObScreen
      onBack={() => router.back()}
      eyebrow="Security"
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app."
      primaryLabel="Verify"
      onPrimary={() => onVerify()}
      primaryLoading={busy}
      primaryDisabled={code.length !== CODE_LEN || busy}
      footnote={
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.footnote}>
            Not you? <Text style={styles.footnoteLink}>Use a different account</Text>
          </Text>
        </Pressable>
      }
    >
      <Banner
        tone="indigo"
        icon="shield"
        title="Dev / sim mode"
        message="The bypass code 000000 works outside production."
      />

      {error ? <Banner tone="danger" icon="alert" title="Couldn’t verify" message={error} /> : null}

      <CodeInput
        value={code}
        onChange={setCode}
        onComplete={(v) => onVerify(v)}
        disabled={busy}
        error={!!error}
        autoFocus
      />
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  footnote: { color: obColors.textMut, fontSize: 13, textAlign: 'center' },
  footnoteLink: { color: obColors.goldDeep, fontWeight: '700' },
});
