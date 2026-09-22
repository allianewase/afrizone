import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Banner } from '../../src/components/Feedback';
import { ObScreen, ObField, ObSuccessModal } from '../../src/onboarding/ObUI';
import { useAuth } from '../../src/auth/AuthContext';

const emailValid = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/**
 * Forgot password. Enter an email → neutral confirmation (no account
 * enumeration). In sim/dev a `devToken` is returned; we surface it with a
 * link to the reset screen so the flow is testable end-to-end.
 *
 * Field stays "Email", not the reference's "Phone number": the real
 * password-reset endpoint (POST /api/auth/password/forgot) takes an email
 * and issues a reset token, not an OTP to a phone - relabeling the field
 * without changing what it actually does would just be a broken form with a
 * matching coat of paint.
 */
export default function ForgotScreen() {
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
    <ObScreen
      onBack={() => router.back()}
      title="Forgot Password"
      subtitle="Enter the email on your account and we'll send you a link to reset your password."
      primaryLabel="Send"
      onPrimary={onSubmit}
      primaryDisabled={!emailValid(email) || busy}
      primaryLoading={busy}
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn't continue" message={error} /> : null}
      {devToken ? <Banner tone="indigo" icon="key" title="Dev / sim mode" message={`Reset token: ${devToken}`} /> : null}

      <ObField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@email.com" autoFocus onSubmitEditing={onSubmit} returnKeyType="go" />

      <ObSuccessModal
        visible={sent}
        title="Check your email"
        message="If an account exists for that email, we've sent a password reset link."
        actionLabel="Enter reset token"
        onAction={() => router.replace({ pathname: '/(auth)/reset', params: { token: devToken ?? '' } })}
        onClose={() => setSent(false)}
      />
    </ObScreen>
  );
}
