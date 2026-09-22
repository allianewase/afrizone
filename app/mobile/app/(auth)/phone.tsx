import React, { useState } from 'react';
import { Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Banner } from '../../src/components/Feedback';
import { ObScreen, ObField } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useAuth } from '../../src/auth/AuthContext';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { readAccountType } from '../../src/lib/accountType';
import { toE164, isValidNgNumber } from '../../src/lib/format';

const COUNTRY_PREFIX = '+234'; // Nigeria default, matches login.tsx

/**
 * Onboarding screen 03. Sign-up's phone-entry step (Individual only -
 * Store/Courier sign up with email+password on register.tsx). account-type.tsx
 * used to route straight to /(auth)/otp with no phone collected at all;
 * login.tsx already had this exact block (collapsed inside the sign-in
 * screen) but sign-up never did.
 */
export default function PhoneScreen() {
  const router = useRouter();
  const { requestOtp } = useAuth();
  const { update } = useOnboarding();
  const accountType = readAccountType(useLocalSearchParams().accountType);

  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneOk = isValidNgNumber(phone);

  async function onContinue() {
    if (!phoneOk || busy) return;
    setBusy(true);
    setError(null);
    const e164 = toE164(COUNTRY_PREFIX, phone);
    try {
      const res = await requestOtp(e164);
      update({ accountType });
      router.push({
        pathname: '/(auth)/otp',
        params: { phone: e164, devCode: res.devCode ?? '' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ObScreen
      onBack={() => router.back()}
      eyebrow="Individual · Step 1 of 2"
      title="Enter your phone number"
      subtitle="We'll text you a 6-digit code to confirm it's you."
      primaryLabel="Send code"
      onPrimary={onContinue}
      primaryDisabled={!phoneOk || busy}
      primaryLoading={busy}
      footnote={
        <Text style={{ color: obColors.textMut, fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
          By continuing you agree to the{' '}
          <Text style={{ color: obColors.navy, fontWeight: '700' }} onPress={() => router.push('/(auth)/terms')}>Terms</Text>
          {' & '}
          <Text style={{ color: obColors.navy, fontWeight: '700' }} onPress={() => router.push('/(auth)/privacy')}>Privacy Policy</Text>
        </Text>
      }
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn't send that" message={error} /> : null}

      <ObField
        label="Mobile number"
        value={phone}
        onChangeText={(t) => setPhone(t.replace(/[^\d\s]/g, '').slice(0, 14))}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="803 000 0001"
        hint={`We'll text a code to ${COUNTRY_PREFIX} ${phone || '…'}`}
        autoFocus
        onSubmitEditing={onContinue}
        returnKeyType="go"
        leftAdorn={<Text style={{ fontSize: 13, fontWeight: '700', color: obColors.navy, borderRightWidth: 1, borderRightColor: obColors.line, paddingRight: 8 }}>🇳🇬 {COUNTRY_PREFIX}</Text>}
      />
    </ObScreen>
  );
}
