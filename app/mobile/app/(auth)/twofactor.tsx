import React, { useState } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/Button';
import { CodeInput } from '../../src/components/CodeInput';
import { Banner } from '../../src/components/Feedback';
import { AuthShell, AuthCard } from '../../src/components/AuthShell';
import { colors, spacing, type } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';

const CODE_LEN = 6;

/**
 * Two-factor challenge (AUTH_FLOW §A2/§B). Reached from the sign-in hub when
 * /api/auth/login returns {requires2fa, challenge}. Enter the 6-digit TOTP →
 * verifyTwoFactor stores the session. Dev bypass `000000` (NODE_ENV !== prod).
 * On success: new/never-completed → KYC, else tabs.
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
      router.replace(isNewUser ? '/(auth)/kyc' : '/(tabs)/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is wrong or expired.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell watermarkSize={280}>
      <AuthCard title="Two-factor" onBack={() => router.back()}>
        <Text style={styles.lead}>Enter the 6-digit code from your authenticator app.</Text>

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

        <Button
          label="Verify"
          icon="shield"
          onPress={() => onVerify()}
          loading={busy}
          disabled={code.length !== CODE_LEN || busy}
        />

        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.altRow}>
          <Text style={styles.altLink}>Use a different account</Text>
        </Pressable>
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.text, fontSize: type.size.md, lineHeight: 24 },
  altRow: { alignItems: 'center', paddingVertical: spacing.sm },
  altLink: { color: colors.goldInk, fontSize: type.size.base, fontWeight: '700' },
});
