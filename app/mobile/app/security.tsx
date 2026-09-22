import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackHeader, AppPrimaryButton, AppStatusPill } from '../src/appui/AppUI';
import { CodeInput } from '../src/components/CodeInput';
import { Icon } from '../src/components/Icon';
import { Banner } from '../src/components/Feedback';
import { obColors, obRadii } from '../src/onboarding/onboardingTheme';
import { useAuth } from '../src/auth/AuthContext';
import type { TwoFactorSetup } from '../src/api/types';

const CODE_LEN = 6;

/**
 * Profile → Security (AUTH_FLOW §A2): enable/disable TOTP 2FA.
 * - Enable: twoFactorSetup() → show qrDataUrl <Image> + secret + code input →
 *   twoFactorEnable. Dev bypass `000000` outside production.
 * - Disable: requires a current code.
 * Status reflects user.totpEnabled.
 *
 * Restyled onto the navy/gold palette. All four states and the enrol/disable
 * round-trips are unchanged.
 */
export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AppBackHeader title="Security" onBack={() => router.back()} />

        <View style={styles.statusCard}>
          <View style={styles.iconWrap}>
            <Icon name="shield" size={22} color={obColors.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Two-factor authentication</Text>
            <Text style={styles.subtitle}>
              Protect your account with an authenticator app.
            </Text>
          </View>
          <AppStatusPill tone={enabled ? 'paid' : 'await'} label={enabled ? 'On' : 'Off'} />
        </View>

        {error ? (
          <View style={{ marginTop: 18 }}>
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
            <AppPrimaryButton label="Enable 2FA" icon="shield" onPress={startSetup} loading={busy} />
          </View>
        ) : null}

        {!enabled && setup ? (
          <View style={styles.block}>
            <Text style={styles.body}>
              Scan this QR code in your authenticator app (or enter the secret
              manually), then enter the 6-digit code to confirm.
            </Text>

            <View style={styles.qrCard}>
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
            </View>

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
            <AppPrimaryButton
              label="Confirm & enable"
              icon="check"
              onPress={() => confirmEnable()}
              loading={busy}
              disabled={code.length !== CODE_LEN || busy}
            />
            <AppPrimaryButton
              label="Cancel"
              variant="outline"
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
            <DangerButton
              label="Disable 2FA"
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
            <DangerButton
              label="Confirm disable"
              icon="lock"
              onPress={() => confirmDisable()}
              disabled={code.length !== CODE_LEN || busy}
            />
            <AppPrimaryButton
              label="Cancel"
              variant="outline"
              onPress={() => {
                setDisabling(false);
                setCode('');
                setError(null);
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Destructive action: outlined rather than filled, so it reads as the
 * serious option without competing with the gold primary. The label is
 * `dangerInk` at 5.67:1 on this tint; the border and glyph keep the brighter
 * `danger` fill, which would be 3.77:1 as text.
 */
function DangerButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: 'lock';
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.dangerBtn,
        disabled && styles.dangerBtnDisabled,
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Icon name={icon} size={17} color={obColors.danger} />
      <Text style={styles.dangerBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: obColors.sand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: { color: obColors.navy, fontSize: 14.5, fontFamily: 'Raleway_800ExtraBold' },
  subtitle: { color: obColors.textMut, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  block: { marginTop: 22, gap: 14 },
  body: { color: obColors.textMut, fontSize: 13.5, lineHeight: 20 },
  qrCard: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    padding: 16,
  },
  qr: { width: 200, height: 200, borderRadius: obRadii.field, backgroundColor: obColors.white },
  secretLabel: {
    color: obColors.textMut,
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  secret: {
    color: obColors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: obRadii.btn,
    borderTopRightRadius: obRadii.btnCut,
    borderWidth: 1.3,
    borderColor: obColors.danger,
    backgroundColor: obColors.dangerBg,
  },
  dangerBtnDisabled: { opacity: 0.5 },
  dangerBtnText: { color: obColors.dangerInk, fontSize: 15, fontFamily: 'Raleway_800ExtraBold' },
});
