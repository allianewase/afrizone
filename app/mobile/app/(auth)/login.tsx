import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Logo from '../../src/components/Logo';
import { Button } from '../../src/components/Button';
import { GoogleButton } from '../../src/components/GoogleButton';
import { Banner } from '../../src/components/Feedback';
import { Icon } from '../../src/components/Icon';
import { colors, spacing, radii, type, layout } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';
import { toE164, isValidNgNumber } from '../../src/lib/format';

const COUNTRY_PREFIX = '+234'; // Nigeria default

const emailValid = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Worker sign-in HUB (AUTH_FLOW §A2): a single screen offering all three
 * methods — phone OTP, Google, and email+password — plus Sign up / Forgot
 * password links. Keeps the existing phone-entry step (collapsible) so the
 * passwordless OTP flow is fully preserved.
 *
 * On password sign-in: if the backend returns `requires2fa` we push the 2FA
 * screen; otherwise we route new/never-completed users to KYC and returning
 * users to the tabs.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requestOtp, loginPassword } = useAuth();

  // Phone OTP sub-step (kept from the original screen).
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  // Email + password.
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
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Brand hero */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xxl }]}>
        <Logo size={42} tone="dark" tagline />
        <Text style={styles.heroTitle}>Honest, flexible work across Africa.</Text>
        <Text style={styles.heroSub}>
          Find tasks, get verified, get paid to your wallet.
        </Text>
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={{
          padding: layout.screenPadding,
          paddingBottom: insets.bottom + 24,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.welcome}>Sign in</Text>

        {error ? (
          <Banner tone="danger" icon="alert" title="Couldn’t continue" message={error} />
        ) : null}

        {/* ---- Phone OTP ---- */}
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
            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.phoneRow}>
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>{COUNTRY_PREFIX}</Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^\d\s]/g, '').slice(0, 14))}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="803 000 0001"
                placeholderTextColor={colors.textMuted}
                style={styles.phoneInput}
                accessibilityLabel="Phone number"
                autoFocus
              />
            </View>
            <Button
              label="Send code"
              icon="chevron-right"
              onPress={onPhoneContinue}
              loading={phoneBusy}
              disabled={!phoneOk || phoneBusy}
            />
            <Text style={styles.hint}>
              By continuing you agree to our Terms & Privacy.
            </Text>
          </View>
        )}

        {/* ---- Google ---- */}
        <GoogleButton onSuccess={routeAfterAuth} onError={setError} />

        {/* ---- divider ---- */}
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or sign in with email</Text>
          <View style={styles.divider} />
        </View>

        {/* ---- Email + password ---- */}
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.inputRow}>
            <Icon name="mail" size={18} color={colors.textMuted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@email.com"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Email"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <Icon name="lock" size={18} color={colors.textMuted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              placeholder="Your password"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Password"
              onSubmitEditing={onSignIn}
              returnKeyType="go"
            />
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/(auth)/forgot')}
          accessibilityRole="button"
          style={styles.forgotRow}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>

        <Button
          label="Sign in"
          icon="chevron-right"
          onPress={onSignIn}
          loading={busy}
          disabled={!canSignIn || busy}
        />

        <Pressable
          onPress={() => router.push('/(auth)/register')}
          accessibilityRole="button"
          style={styles.altRow}
        >
          <Text style={styles.altText}>
            New to Afrizone? <Text style={styles.altLink}>Create an account →</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  hero: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  heroTitle: {
    color: colors.white,
    fontSize: type.size.display,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 36,
    marginTop: spacing.md,
  },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: type.size.md, lineHeight: 22 },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
  },
  welcome: {
    color: colors.text,
    fontSize: type.size.xl,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  phoneBlock: { gap: spacing.md },
  field: { gap: 6 },
  label: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: type.size.sm },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  prefix: {
    minHeight: layout.hitTarget,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSand,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixText: { color: colors.text, fontSize: type.size.md, fontWeight: '700' },
  phoneInput: {
    flex: 1,
    minHeight: layout.hitTarget,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    fontSize: type.size.md,
    color: colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.hitTarget,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: type.size.md, color: colors.text, paddingVertical: spacing.sm },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.textMuted, fontSize: type.size.sm },
  forgotRow: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
  forgotText: { color: colors.clay, fontSize: type.size.base, fontWeight: '700' },
  altRow: { alignItems: 'center', paddingVertical: spacing.sm },
  altText: { color: colors.textMuted, fontSize: type.size.base },
  altLink: { color: colors.clay, fontWeight: '700' },
});
