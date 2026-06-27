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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { Banner } from '../../src/components/Feedback';
import { colors, spacing, radii, type, layout } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';

const MIN_PASSWORD = 8;

/**
 * Reset password (AUTH_FLOW §A2/§B). Paste the reset token (prefilled from the
 * dev token when arriving from Forgot) + a new password (≥8) → passwordReset →
 * success → back to the sign-in hub.
 */
export default function ResetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { passwordReset } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();

  const [token, setToken] = useState(
    typeof params.token === 'string' ? params.token : ''
  );
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenOk = token.trim().length > 0;
  const passOk = password.length >= MIN_PASSWORD;
  const canSubmit = tokenOk && passOk;

  async function onSubmit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await passwordReset(token, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password.');
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
        <Text style={styles.topTitle}>Reset password</Text>
        <View style={{ width: layout.hitTarget }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: layout.screenPadding, gap: spacing.lg, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {done ? (
          <>
            <Banner
              tone="money"
              icon="check-circle"
              title="Password updated"
              message="You can now sign in with your new password."
            />
            <Button
              label="Back to sign in"
              icon="chevron-right"
              onPress={() => router.replace('/(auth)/login')}
            />
          </>
        ) : (
          <>
            <Text style={styles.lead}>
              Enter the reset token from your email and choose a new password.
            </Text>

            {error ? (
              <Banner tone="danger" icon="alert" title="Couldn’t reset" message={error} />
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Reset token</Text>
              <View style={styles.inputRow}>
                <Icon name="key" size={18} color={colors.textMuted} />
                <TextInput
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Paste your token"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="Reset token"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>New password</Text>
              <View style={styles.inputRow}>
                <Icon name="lock" size={18} color={colors.textMuted} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="New password"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="New password"
                  onSubmitEditing={onSubmit}
                  returnKeyType="go"
                />
              </View>
              <Text style={styles.hint}>At least {MIN_PASSWORD} characters.</Text>
            </View>

            <Button
              label="Set new password"
              icon="check"
              onPress={onSubmit}
              loading={busy}
              disabled={!canSubmit || busy}
            />

            <Pressable
              onPress={() => router.replace('/(auth)/login')}
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
  hint: { color: colors.textMuted, fontSize: type.size.sm },
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
