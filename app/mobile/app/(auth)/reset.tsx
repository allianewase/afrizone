import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Feedback';
import { PasswordField } from '../../src/components/PasswordField';
import { UnderlineInput } from '../../src/components/UnderlineInput';
import { SuccessCard } from '../../src/components/SuccessCard';
import { AuthScreen, AuthFooterLink } from '../../src/components/AuthShell';
import { useAuth } from '../../src/auth/AuthContext';

const MIN_PASSWORD = 8;

/**
 * Reset password. Paste the reset token (prefilled from the dev token when
 * arriving from Forgot, or a deep link) + a new password (≥8, confirmed) →
 * passwordReset → success → back to the sign-in hub.
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
    <AuthScreen
      onBack={() => router.back()}
      title="Reset Password"
      subtitle="Enter the reset token from your email and choose a new password."
      footer={<AuthFooterLink text="Have an account?" linkText="Sign in" onPress={() => router.back()} />}
    >
      {done ? (
        <SuccessCard
          title="Password changed!"
          message="No hassle anymore: you can now sign in with your new password."
          actionLabel="Back to sign in"
          onAction={() => router.replace('/(auth)/login')}
        />
      ) : (
        <>
          {error ? <Banner tone="danger" icon="alert" title="Couldn’t reset" message={error} /> : null}

          <UnderlineInput
            label="Reset token"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Paste your token"
            accessibilityLabel="Reset token"
          />

          <PasswordField
            label="New Password"
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            hint={`At least ${MIN_PASSWORD} characters.`}
          />

          <PasswordField
            label="Confirm Password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter your new password"
            error={confirm.length > 0 && !matchOk ? 'Passwords don’t match.' : undefined}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          <Button label="Reset Password" onPress={onSubmit} loading={busy} disabled={!canSubmit || busy} />
        </>
      )}
    </AuthScreen>
  );
}
