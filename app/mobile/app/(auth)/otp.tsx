import React, { useEffect, useRef, useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  View,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Feedback';
import { AuthShell, AuthCard } from '../../src/components/AuthShell';
import { colors, spacing, radii, type } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';
import { ApiError } from '../../src/api/client';

const CODE_LEN = 6;
const RESEND_SECONDS = 60;
const MASTER_CODE = '123456'; // dev/sim master (accepted when NODE_ENV !== production)

type Status = 'idle' | 'verifying' | 'error' | 'locked';

/**
 * OTP step (AUTH_FLOW §A): 6-digit code, auto-advance, paste, 60s resend timer.
 * On verify: isNewUser → KYC stepper, else → tabs. In dev/sim, a returned
 * `devCode` is shown as a hint and prefilled; master `123456` is accepted.
 */
export default function OtpScreen() {
  const router = useRouter();
  const { verifyOtp, requestOtp } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; devCode?: string }>();
  const phone = typeof params.phone === 'string' ? params.phone : '';
  const initialDevCode =
    typeof params.devCode === 'string' && params.devCode.length === CODE_LEN ? params.devCode : '';

  const [devCode, setDevCode] = useState(initialDevCode);
  const [digits, setDigits] = useState<string[]>(() =>
    initialDevCode ? initialDevCode.split('') : Array(CODE_LEN).fill('')
  );
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  const inputs = useRef<Array<TextInput | null>>([]);

  // Resend countdown.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const code = digits.join('');
  const complete = code.length === CODE_LEN && digits.every((d) => d !== '');
  const locked = status === 'locked';

  function setDigit(index: number, value: string) {
    // Handle paste of the full code into any box.
    const onlyDigits = value.replace(/\D/g, '');
    if (onlyDigits.length > 1) {
      const next = onlyDigits.slice(0, CODE_LEN).split('');
      const filled = Array(CODE_LEN)
        .fill('')
        .map((_, i) => next[i] ?? '');
      setDigits(filled);
      const last = Math.min(next.length, CODE_LEN) - 1;
      inputs.current[last]?.focus();
      return;
    }
    setDigits((prev) => {
      const copy = [...prev];
      copy[index] = onlyDigits;
      return copy;
    });
    if (status === 'error') setStatus('idle');
    if (onlyDigits && index < CODE_LEN - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function onKeyPress(index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      setDigits((prev) => {
        const copy = [...prev];
        copy[index - 1] = '';
        return copy;
      });
    }
  }

  async function onVerify() {
    if (!complete || status === 'verifying') return;
    setStatus('verifying');
    setError(null);
    try {
      const isNewUser = await verifyOtp(phone, code);
      if (isNewUser) {
        router.replace('/(auth)/kyc');
      } else {
        router.replace('/(tabs)/home');
      }
    } catch (e) {
      const status429 = e instanceof ApiError && e.status === 429;
      setStatus(status429 ? 'locked' : 'error');
      setError(e instanceof Error ? e.message : 'That code is wrong or expired.');
    }
  }

  async function onResend() {
    if (secondsLeft > 0) return;
    setStatus('idle');
    setError(null);
    setDigits(Array(CODE_LEN).fill(''));
    try {
      const res = await requestOtp(phone);
      if (res.devCode) {
        setDevCode(res.devCode);
        setDigits(res.devCode.split(''));
      }
      setSecondsLeft(RESEND_SECONDS);
      inputs.current[0]?.focus();
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not resend a code.');
    }
  }

  return (
    <AuthShell watermarkSize={280}>
      <AuthCard title="Verify your number" onBack={() => router.back()}>
        <Text style={styles.lead}>
          Enter the 6-digit code we sent to{'\n'}
          <Text style={styles.phone}>{phone || 'your phone'}</Text>.
        </Text>

        {devCode ? (
          <Banner
            tone="indigo"
            icon="shield"
            title="Dev / sim mode"
            message={`Your code is ${devCode}. The master code ${MASTER_CODE} also works.`}
          />
        ) : null}

        {status === 'locked' ? (
          <Banner
            tone="danger"
            icon="alert"
            title="Too many attempts"
            message={error ?? 'Please wait and request a new code.'}
          />
        ) : status === 'error' ? (
          <Banner tone="danger" icon="alert" title="Couldn’t verify" message={error ?? 'That code is wrong or expired.'} />
        ) : null}

        <View style={styles.boxes}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChangeText={(v) => setDigit(i, v)}
              onKeyPress={(e) => onKeyPress(i, e)}
              keyboardType="number-pad"
              maxLength={CODE_LEN}
              editable={!locked && status !== 'verifying'}
              style={[styles.box, d ? styles.boxFilled : null, status === 'error' || locked ? styles.boxError : null]}
              accessibilityLabel={`Digit ${i + 1}`}
              autoFocus={i === 0 && !devCode}
              textContentType="oneTimeCode"
            />
          ))}
        </View>

        <Button
          label="Verify"
          icon="check"
          onPress={onVerify}
          loading={status === 'verifying'}
          disabled={!complete || locked || status === 'verifying'}
        />

        <Pressable onPress={onResend} disabled={secondsLeft > 0} accessibilityRole="button" style={styles.resendRow}>
          <Text style={[styles.resend, secondsLeft > 0 && styles.resendDisabled]}>
            {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Didn’t get it? Resend code'}
          </Text>
        </Pressable>
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.text, fontSize: type.size.md, lineHeight: 24 },
  phone: { fontWeight: '800', color: colors.clay },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    minWidth: 0,
    height: 58,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1.5,
    borderRadius: radii.input,
    textAlign: 'center',
    fontSize: type.size.xxl,
    fontWeight: '800',
    color: colors.text,
  },
  boxFilled: { borderColor: colors.clay, backgroundColor: colors.claySoft },
  boxError: { borderColor: colors.danger },
  resendRow: { alignItems: 'center', paddingVertical: spacing.sm },
  resend: { color: colors.clay, fontSize: type.size.base, fontWeight: '700' },
  resendDisabled: { color: colors.textMuted, fontWeight: '600' },
});
