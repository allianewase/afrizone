import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { GoogleButton } from '../../src/components/GoogleButton';
import { Banner } from '../../src/components/Feedback';
import { PasswordField } from '../../src/components/PasswordField';
import { UnderlineInput } from '../../src/components/UnderlineInput';
import { PatternDivider } from '../../src/components/Motif';
import { AuthScreen, AuthFooterLink } from '../../src/components/AuthShell';
import { colors, spacing, type, motif } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';
import { ACCOUNT_COPY, readAccountType } from '../../src/lib/accountType';

const MIN_PASSWORD = 8;
const emailValid = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Worker sign-up: Google, or name + email + password + confirm → register →
 * creates a WORKER (isNewUser:true) and routes to the KYC stepper.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  // Chosen at the front door. Falls back to INDIVIDUAL when this screen is
  // reached directly - a deep link or a back-navigation should not leave the
  // account type undefined.
  const accountType = readAccountType(useLocalSearchParams().accountType);
  const copy = ACCOUNT_COPY[accountType];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = name.trim().length >= 2;
  const emailOk = emailValid(email);
  const passOk = password.length >= MIN_PASSWORD;
  const matchOk = confirm.length > 0 && confirm === password;
  const canSubmit = nameOk && emailOk && passOk && matchOk;

  function routeAfterAuth(isNewUser: boolean) {
    router.replace(isNewUser ? '/(auth)/kyc' : '/(tabs)/home');
  }

  async function onSubmit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const isNewUser = await register(name, email, password, accountType);
      routeAfterAuth(isNewUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      onBack={() => router.back()}
      title={copy.registerTitle}
      subtitle={copy.registerSubtitle}
      footer={
        <AuthFooterLink text="Have an account?" linkText="Sign in" onPress={() => router.back()} />
      }
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn’t sign up" message={error} /> : null}

      <GoogleButton onSuccess={routeAfterAuth} onError={setError} />

      <View style={styles.dividerRow}>
        <PatternDivider color={colors.line} opacity={motif.dividerOpacityLight} style={styles.dividerMotif} />
        <Text style={styles.dividerText}>or sign up with email</Text>
        <PatternDivider color={colors.line} opacity={motif.dividerOpacityLight} style={styles.dividerMotif} />
      </View>

      <UnderlineInput
        label="Full name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        placeholder="Amaka Obi"
        accessibilityLabel="Full name"
        autoFocus
      />

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
        placeholder="Create a password"
        hint={`At least ${MIN_PASSWORD} characters.`}
      />

      <PasswordField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter your password"
        error={confirm.length > 0 && !matchOk ? 'Passwords don’t match.' : undefined}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />

      <Button label="Create account" onPress={onSubmit} loading={busy} disabled={!canSubmit || busy} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dividerMotif: { flex: 1 },
  dividerText: { color: colors.textMuted, fontSize: type.size.sm },
});
