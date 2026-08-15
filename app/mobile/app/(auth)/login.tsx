import React, { useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { GoogleButton } from '../../src/components/GoogleButton';
import { Banner } from '../../src/components/Feedback';
import { PasswordField } from '../../src/components/PasswordField';
import { UnderlineInput } from '../../src/components/UnderlineInput';
import { PatternDivider } from '../../src/components/Motif';
import { AuthScreen, AuthFooterLink } from '../../src/components/AuthShell';
import { colors, spacing, type, motif } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';

const emailValid = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Worker sign-in: Google, or email + password. Phone-OTP was dropped to match
 * the reference design exactly, which orphaned otp.tsx (deleted); Google
 * sign-in was dropped the same way but restored on request - GoogleButton.tsx
 * came back verbatim from git history (bf22baa^), still fully compatible with
 * the current theme/API.
 *
 * On password sign-in: if the backend returns `requires2fa` we push the 2FA
 * screen; otherwise we route new/never-completed users to KYC and returning
 * users to the tabs.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { loginPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSignIn = emailValid(email) && password.length > 0;

  function routeAfterAuth(isNewUser: boolean) {
    router.replace(isNewUser ? '/(auth)/kyc' : '/(tabs)/home');
  }

  async function onSignIn() {
    if (!canSignIn || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await loginPassword(email, password);
      if (res.kind === '2fa') {
        router.push({
          pathname: '/(auth)/twofactor',
          params: { challenge: res.challenge },
        });
      } else {
        routeAfterAuth(res.isNewUser);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Login"
      subtitle="Welcome back, sign in to continue finding work"
      footer={
        <AuthFooterLink
          text="Don't have an account?"
          linkText="Create account"
          onPress={() => router.push('/(auth)/register')}
        />
      }
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn’t sign in" message={error} /> : null}

      <GoogleButton onSuccess={routeAfterAuth} onError={setError} />

      <View style={styles.dividerRow}>
        <PatternDivider color={colors.line} opacity={motif.dividerOpacityLight} style={styles.dividerMotif} />
        <Text style={styles.dividerText}>or sign in with email</Text>
        <PatternDivider color={colors.line} opacity={motif.dividerOpacityLight} style={styles.dividerMotif} />
      </View>

      <UnderlineInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        placeholder="you@email.com"
        accessibilityLabel="Email"
      />

      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        autoComplete="password"
        onSubmitEditing={onSignIn}
        returnKeyType="go"
      />

      <Pressable
        onPress={() => router.push('/(auth)/forgot')}
        accessibilityRole="button"
        style={styles.forgotRow}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </Pressable>

      <Button label="Sign In" onPress={onSignIn} loading={busy} disabled={!canSignIn || busy} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgotRow: { alignSelf: 'flex-end' },
  forgotText: { color: colors.goldInk, fontSize: type.size.sm, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dividerMotif: { flex: 1 },
  dividerText: { color: colors.textMuted, fontSize: type.size.sm },
});
