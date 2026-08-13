import React, { useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { CodeInput } from '../src/components/CodeInput';
import { Icon } from '../src/components/Icon';
import { StatusPill } from '../src/components/StatusPill';
import { Banner } from '../src/components/Feedback';
import { colors, spacing, radii, type, fontFamily } from '../src/theme';
import { useAuth } from '../src/auth/AuthContext';
import type { TwoFactorSetup } from '../src/api/types';

const CODE_LEN = 6;

/**
 * Profile → Security (AUTH_FLOW §A2): enable/disable TOTP 2FA.
 * - Enable: twoFactorSetup() → show qrDataUrl <Image> + secret + code input →
 *   twoFactorEnable. Dev bypass `000000` outside production.
 * - Disable: requires a current code.
 * Status reflects user.totpEnabled.
 */
export default function SecurityScreen() {
  const { user, twoFactorSetup, twoFactorEnable, twoFactorDisable } = useAuth();
  const enabled = !!user?.totpEnabled;

  // enrolment state
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await twoFactorSetup();
      setSetup(res);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start 2FA setup.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(value?: string) {
    const c = value ?? code;
    if (c.length !== CODE_LEN || busy) return;
    setBusy(true);
    setError(null);
    try {
      await twoFactorEnable(c);
      setSetup(null);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is wrong. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable(value?: string) {
    const c = value ?? code;
    if (c.length !== CODE_LEN || busy) return;
    setBusy(true);
    setError(null);
    try {
      await twoFactorDisable(c);
      setDisabling(false);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is wrong. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Security" back>
      <Card style={styles.statusCard}>
        <View style={styles.statusHead}>
          <View style={styles.iconWrap}>
            <Icon name="shield" size={22} color={colors.clay} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Two-factor authentication</Text>
            <Text style={styles.subtitle}>
              Protect your account with an authenticator app.
            </Text>
          </View>
          <StatusPill
            status={enabled ? 'paid' : 'pending'}
            small
            label={enabled ? 'On' : 'Off'}
          />
        </View>
      </Card>

      {error ? (
        <View style={{ marginTop: spacing.lg }}>
          <Banner tone="danger" icon="alert" title="Couldn’t continue" message={error} />
        </View>
      ) : null}

      {/* ---- DISABLED → enable flow ---- */}
      {!enabled && !setup ? (
        <View style={styles.block}>
          <Text style={styles.body}>
            When enabled, you’ll enter a 6-digit code from your authenticator app
            each time you sign in with email and password.
          </Text>
          <Button label="Enable 2FA" icon="shield" onPress={startSetup} loading={busy} />
        </View>
      ) : null}

      {!enabled && setup ? (
        <View style={styles.block}>
          <Text style={styles.body}>
            Scan this QR code in your authenticator app (or enter the secret
            manually), then enter the 6-digit code to confirm.
          </Text>

          <Card style={styles.qrCard}>
            <Image
              source={{ uri: setup.qrDataUrl }}
              style={styles.qr}
              accessibilityLabel="2FA QR code"
              resizeMode="contain"
            />
            <Text style={styles.secretLabel}>Secret</Text>
            <Text selectable style={styles.secret}>
              {setup.secret}
            </Text>
          </Card>

          <Banner
            tone="indigo"
            icon="key"
            title="Dev / sim mode"
            message="The bypass code 000000 works outside production."
          />

          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={(v) => confirmEnable(v)}
            disabled={busy}
            error={!!error}
            autoFocus
          />
          <Button
            label="Confirm & enable"
            icon="check"
            onPress={() => confirmEnable()}
            loading={busy}
            disabled={code.length !== CODE_LEN || busy}
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => {
              setSetup(null);
              setCode('');
              setError(null);
            }}
          />
        </View>
      ) : null}

      {/* ---- ENABLED → disable flow ---- */}
      {enabled && !disabling ? (
        <View style={styles.block}>
          <Text style={styles.body}>
            Two-factor authentication is on. You’ll need a code from your
            authenticator app to disable it.
          </Text>
          <Button
            label="Disable 2FA"
            variant="danger"
            icon="lock"
            onPress={() => {
              setDisabling(true);
              setCode('');
              setError(null);
            }}
          />
        </View>
      ) : null}

      {enabled && disabling ? (
        <View style={styles.block}>
          <Text style={styles.body}>
            Enter a current 6-digit code to turn off two-factor authentication.
          </Text>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={(v) => confirmDisable(v)}
            disabled={busy}
            error={!!error}
            autoFocus
          />
          <Button
            label="Confirm disable"
            variant="danger"
            onPress={() => confirmDisable()}
            loading={busy}
            disabled={code.length !== CODE_LEN || busy}
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => {
              setDisabling(false);
              setCode('');
              setError(null);
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: { marginTop: spacing.sm },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.claySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: type.size.md, fontFamily: fontFamily.extrabold },
  subtitle: { color: colors.textMuted, fontSize: type.size.sm, marginTop: 2 },
  block: { marginTop: spacing.xl, gap: spacing.lg },
  body: { color: colors.textMuted, fontSize: type.size.md, lineHeight: 22 },
  qrCard: { alignItems: 'center', gap: spacing.sm },
  qr: { width: 200, height: 200, borderRadius: radii.input, backgroundColor: colors.white },
  secretLabel: {
    color: colors.textMuted,
    fontSize: type.size.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secret: {
    color: colors.text,
    fontSize: type.size.md,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
