import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Banner } from '../../src/components/Feedback';
import { ObScreen, ObField, ObPasswordField, ObSuccessModal } from '../../src/onboarding/ObUI';
import { useAuth } from '../../src/auth/AuthContext';

const MIN_PASSWORD = 8;

/**
 * Reset password. Paste the reset token (prefilled from the dev token when
 * arriving from Forgot, or a deep link) + a new password (>=8, confirmed) →
 * passwordReset → success modal → back to sign-in, matching the reference's
 * "Reset Successful" card exactly.
 */
export default function ResetScreen() {
  const router = useRouter();
  const { passwordReset } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();

  const [token, setToken] = useState(typeof params.token === 'string' ? params.token : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenOk = token.trim().length > 0;
  const passOk = password.length >= MIN_PASSWORD;
  const matchOk = confirm.length > 0 && confirm === password;
  const canSubmit = tokenOk && passOk && matchOk;

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
    <ObScreen
      onBack={() => router.back()}
      title="Reset Password"
      subtitle="Use at least 8 characters, and paste the reset token from your email."
      primaryLabel="Reset"
      onPrimary={onSubmit}
      primaryDisabled={!canSubmit || busy}
      primaryLoading={busy}
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn't reset" message={error} /> : null}

      <ObField label="Reset token" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} placeholder="Paste your token" />
      <ObPasswordField label="New password" value={password} onChangeText={setPassword} placeholder="Enter new password" hint={`At least ${MIN_PASSWORD} characters.`} />
      <ObPasswordField
        label="Re-enter password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter password"
        error={confirm.length > 0 && !matchOk ? "Passwords don't match." : undefined}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />

      <ObSuccessModal
        visible={done}
        title="Reset Successful"
        message="Your password is successfully reset."
        actionLabel="Back to home"
        onAction={() => router.replace('/(auth)/login')}
      />
    </ObScreen>
  );
}
