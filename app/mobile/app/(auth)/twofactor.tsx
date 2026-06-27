import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { CodeInput } from '../../src/components/CodeInput';
import { Banner } from '../../src/components/Feedback';
import { colors, spacing, type, layout } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';

const CODE_LEN = 6;

/**
 * Two-factor challenge (AUTH_FLOW §A2/§B). Reached from the sign-in hub when
 * /api/auth/login returns {requires2fa, challenge}. Enter the 6-digit TOTP →
 * verifyTwoFactor stores the session. Dev bypass `000000` (NODE_ENV !== prod).
 * On success: new/never-completed → KYC, else tabs.
 */
export default function TwoFactorScreen() {
  const insets = useSafeAreaInsets();
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
        <Text style={styles.topTitle}>Two-factor</Text>
        <View style={{ width: layout.hitTarget }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lead}>
          Enter the 6-digit code from your authenticator app.
        </Text>

        <Banner
          tone="indigo"
          icon="shield"
          title="Dev / sim mode"
          message="The bypass code 000000 works outside production."
        />

        {error ? (
          <Banner tone="danger" icon="alert" title="Couldn’t verify" message={error} />
        ) : null}

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

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={styles.altRow}
        >
          <Text style={styles.altLink}>Use a different account</Text>
        </Pressable>
      </View>
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
  body: { flex: 1, padding: layout.screenPadding, gap: spacing.xl },
  lead: { color: colors.text, fontSize: type.size.md, lineHeight: 24 },
  altRow: { alignItems: 'center', paddingVertical: spacing.sm },
  altLink: { color: colors.clay, fontSize: type.size.base, fontWeight: '700' },
});
