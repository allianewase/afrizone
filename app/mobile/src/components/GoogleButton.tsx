import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radii, layout, type, spacing } from '../theme';
import { useGoogleAuth } from '../auth/useGoogleAuth';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

interface Props {
  /** Called with isNewUser once the session is established. */
  onSuccess: (isNewUser: boolean) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

/**
 * "Continue with Google" control for workers (AUTH_FLOW §A2). Env-gated via the
 * per-platform EXPO_PUBLIC_GOOGLE_*_CLIENT_ID ids: when ALL are ABSENT it renders
 * disabled with a small "Google sign-in not configured" note (mirrors web-admin)
 * and never crashes.
 * When present it runs the expo-auth-session flow, gets the ID token, and calls
 * AuthContext.googleSignIn → POST /api/auth/google {context:"worker"}.
 */
export function GoogleButton({ onSuccess, onError, disabled }: Props) {
  const { configured, ready, promptGoogle } = useGoogleAuth();
  const { googleSignIn } = useAuth();
  const [busy, setBusy] = useState(false);

  async function onPress() {
    if (busy) return;
    setBusy(true);
    try {
      const idToken = await promptGoogle();
      if (!idToken) {
        setBusy(false);
        return; // user cancelled / dismissed
      }
      const isNewUser = await googleSignIn(idToken);
      onSuccess(isNewUser);
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 503
          ? 'Google sign-in is not configured on the server.'
          : e instanceof Error
          ? e.message
          : 'Google sign-in failed.';
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <View style={{ gap: 6 }}>
        <Pressable
          disabled
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.base, styles.disabled]}
        >
          <GoogleGlyph />
          <Text style={styles.label}>Continue with Google</Text>
        </Pressable>
        <Text style={styles.note}>Google sign-in not configured</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy || !ready}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        (disabled || busy || !ready) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <GoogleGlyph />
          <Text style={styles.label}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.4 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.9 36.4 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: 18,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignSelf: 'stretch',
  },
  label: { fontSize: type.size.md, fontWeight: '700', color: colors.text },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
  note: { color: colors.textMuted, fontSize: type.size.sm, textAlign: 'center' },
});
