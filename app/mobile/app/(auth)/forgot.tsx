import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { Banner } from '../../src/components/Feedback';
import { colors, spacing, radii, type, layout } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';

const emailValid = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Forgot password (AUTH_FLOW §A2/§B). Enter an email → neutral confirmation
 * (no account enumeration). In sim/dev a `devToken` is returned; we surface it
 * with a link to the reset screen so the flow is testable end-to-end.
 */
export default function ForgotScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { passwordForgot } = useAuth();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!emailValid(email) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await passwordForgot(email);
      setSent(true);
      setDevToken(res.devToken ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a reset link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topbar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Forgot password</Text>
        <View style={{ width: layout.hitTarget }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: layout.screenPadding, gap: spacing.lg, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <>
            <Banner
              tone="money"
              icon="check-circle"
              title="Check your email"
              message="If an account exists for that email, we’ve sent a password reset link."
            />
            {devToken ? (
              <Banner
                tone="indigo"
                icon="key"
                title="Dev / sim mode"
                message={`Reset token: ${devToken}`}
              />
            ) : null}
            <Button
              label="Enter reset token"
              icon="key"
              onPress={() =>
                router.replace({
                  pathname: '/(auth)/reset',
                  params: { token: devToken ?? '' },
                })
              }
            />
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              accessibilityRole="button"
              style={styles.altRow}
            >
              <Text style={styles.altLink}>Back to sign in</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.lead}>
              Enter the email on your account and we’ll send you a link to reset
              your password.
            </Text>

            {error ? (
              <Banner tone="danger" icon="alert" title="Couldn’t continue" message={error} />
            ) : null}

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
                  autoFocus
                  onSubmitEditing={onSubmit}
                  returnKeyType="go"
                />
              </View>
            </View>

            <Button
              label="Send reset link"
              icon="chevron-right"
              onPress={onSubmit}
              loading={busy}
              disabled={!emailValid(email) || busy}
            />

            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              style={styles.altRow}
            >
              <Text style={styles.altLink}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: layout.hitTarget,
    height: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.md,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: type.size.md,
    fontWeight: '700',
    color: colors.text,
  },
  lead: { color: colors.textMuted, fontSize: type.size.md, lineHeight: 22 },
  field: { gap: 6 },
  label: { color: colors.textMuted, fontSize: type.size.sm, fontWeight: '600' },
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
  altRow: { alignItems: 'center', paddingVertical: spacing.sm },
  altLink: { color: colors.clay, fontSize: type.size.base, fontWeight: '700' },
});
