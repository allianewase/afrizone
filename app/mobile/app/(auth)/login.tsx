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
import { toE164, isValidNgNumber } from '../../src/lib/format';

const COUNTRY_PREFIX = '+234'; // Nigeria default
const emailValid = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Worker sign-in: phone+OTP, Google, or email + password. Phone-OTP and
 * Google were both dropped to match the reference design exactly, which
 * orphaned otp.tsx and GoogleButton.tsx (both deleted) - restored on request
 * for the pilot launch, which needs phone-based sign-up for workers without
 * reliable email. Both came back compatible with the current theme/API with
 * only layout adaptation needed (old AuthShell/AuthCard -> current
 * AuthScreen), no logic changes.
 *
 * On password sign-in: if the backend returns `requires2fa` we push the 2FA
 * screen; otherwise we route new/never-completed users to KYC and returning
 * users to the tabs.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { requestOtp, loginPassword } = useAuth();

  // Phone OTP entry (collapsible).
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneOk = isValidNgNumber(phone);
  const canSignIn = emailValid(email) && password.length > 0;

  function routeAfterAuth(isNewUser: boolean) {
    router.replace(isNewUser ? '/(auth)/kyc' : '/(tabs)/home');
  }

  async function onPhoneContinue() {
    if (!phoneOk) {
      setError('Enter a valid Nigerian mobile number.');
      return;
    }
    setPhoneBusy(true);
    setError(null);
    const e164 = toE164(COUNTRY_PREFIX, phone);
    try {
      const res = await requestOtp(e164);
      router.push({
        pathname: '/(auth)/otp',
        params: { phone: e164, devCode: res.devCode ?? '' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a code.');
    } finally {
      setPhoneBusy(false);
    }
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

      {!phoneOpen ? (
        <Button
          label="Continue with phone"
          icon="phone"
          variant="secondary"
          onPress={() => {
            setError(null);
            setPhoneOpen(true);
          }}
        />
      ) : (
        <View style={styles.phoneBlock}>
          <UnderlineInput
            label="Mobile number"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^\d\s]/g, '').slice(0, 14))}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="803 000 0001"
            hint={`We'll text a code to ${COUNTRY_PREFIX} ${phone || '…'}`}
            accessibilityLabel="Phone number"
            autoFocus
          />
          <Button
            label="Send code"
            icon="chevron-right"
            onPress={onPhoneContinue}
            loading={phoneBusy}
            disabled={!phoneOk || phoneBusy}
          />
        </View>
      )}

      <View style={styles.dividerRow}>
        <PatternDivider color={colors.line} opacity={motif.dividerOpacityLight} style={styles.dividerMotif} />
        <Text style={styles.dividerText}>or continue with</Text>
        <PatternDivider color={colors.line} opacity={motif.dividerOpacityLight} style={styles.dividerMotif} />
      </View>

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
  phoneBlock: { gap: spacing.md },
});
