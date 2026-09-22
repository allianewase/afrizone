import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GoogleButton } from '../../src/components/GoogleButton';
import { Banner } from '../../src/components/Feedback';
import { ObScreen, ObField, ObPasswordField } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useAuth } from '../../src/auth/AuthContext';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { ACCOUNT_COPY, readAccountType } from '../../src/lib/accountType';

const MIN_PASSWORD = 8;
const emailValid = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Worker sign-up: Google, or name + email + password + confirm → register →
 * creates a WORKER (isNewUser:true) and routes to onboarding.
 *
 * Not one of the 12 screens in afrizone-onboarding-screens.html (it has no
 * password step - only the phone+OTP path is shown), but restyled to match
 * everything around it since Store/Courier both pass through here.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const { update } = useOnboarding();
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
    update({ accountType });
    router.replace(isNewUser ? '/(auth)/personal-details' : '/(tabs)/home');
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
    <ObScreen
      onBack={() => router.back()}
      title={copy.registerTitle}
      subtitle={copy.registerSubtitle}
      primaryLabel="Create account"
      onPrimary={onSubmit}
      primaryDisabled={!canSubmit || busy}
      primaryLoading={busy}
      footnote={
        <Text style={styles.footnoteText}>
          Have an account? <Text style={styles.footnoteLink} onPress={() => router.back()}>Sign in</Text>
        </Text>
      }
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn't sign up" message={error} /> : null}

      <GoogleButton onSuccess={routeAfterAuth} onError={setError} />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or sign up with email</Text>
        <View style={styles.dividerLine} />
      </View>

      <ObField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" placeholder="Amaka Obi" autoFocus />
      <ObField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@email.com" />
      <ObPasswordField label="Password" value={password} onChangeText={setPassword} placeholder="Create a password" hint={`At least ${MIN_PASSWORD} characters.`} />
      <ObPasswordField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter your password"
        error={confirm.length > 0 && !matchOk ? "Passwords don't match." : undefined}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: obColors.line },
  dividerText: { color: obColors.textMut, fontSize: 13 },
  footnoteText: { color: obColors.textMut, fontSize: 13, textAlign: 'center' },
  footnoteLink: { color: obColors.goldDeep, fontWeight: '700' },
});
