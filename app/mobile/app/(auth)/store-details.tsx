import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner } from '../../src/components/Feedback';
import { ObScreen, ObField } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useAuth } from '../../src/auth/AuthContext';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { submitOnboarding, ApiError } from '../../src/onboarding/submit';

/**
 * Onboarding screen 09, AZM Store's role-specific step: business name, CAC
 * number, TIN, address.
 *
 * THIS FORM DOES NOT SUBMIT ANYWHERE YET. Checked before building this: the
 * only CAC-related endpoint is POST /api/organizations/:id/cac, which
 * requires an Organization that already exists - and there is no self-serve
 * "create my store" endpoint anywhere in the server. A store's Organization
 * record is created by Afrizone staff (see app/store/index.tsx's "no store
 * yet" state, which is a normal long-lived condition for exactly this
 * reason), not by the person signing up.
 *
 * So this screen collects the fields for real (matching what will be asked
 * for later) and carries them in onboarding state, but "Continue" only
 * submits the personal identity check from the previous screens - not this
 * business data. A store account always lands on the pending-review screen
 * next regardless of how that identity check comes back, because approval
 * to take orders needs the audit visit either way (Blueprint SS8).
 *
 * TODO(server): once a self-serve store-creation endpoint exists, wire this
 * screen's onContinue to actually submit state.storeDetails to it.
 */
export default function StoreDetailsScreen() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const { state, update } = useOnboarding();
  const [businessName, setBusinessName] = useState(state.storeDetails.businessName);
  const [cacNumber, setCacNumber] = useState(state.storeDetails.cacNumber);
  const [tin, setTin] = useState(state.storeDetails.tin);
  const [address, setAddress] = useState(state.storeDetails.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = businessName.trim().length >= 2 && address.trim().length >= 5;

  async function onContinue() {
    if (!canContinue || busy) return;
    const storeDetails = { businessName: businessName.trim(), cacNumber: cacNumber.trim(), tin: tin.trim(), address: address.trim() };
    update({ storeDetails });
    setBusy(true);
    setError(null);
    try {
      await submitOnboarding({ ...state, storeDetails }, updateUser);
      router.replace({
        pathname: '/(auth)/submitted',
        params: {
          status: 'PENDING',
          note: 'A member of the Afrizone team will be in touch to complete your store registration and arrange an audit visit.',
        },
      });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not submit verification.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ObScreen
      onBack={() => router.back()}
      eyebrow="Business details"
      title="Register your premises"
      primaryLabel="Submit for audit"
      onPrimary={onContinue}
      primaryDisabled={!canContinue}
      primaryLoading={busy}
    >
      <View style={styles.tagRow}>
        <Text style={styles.tag}>AZM Store</Text>
      </View>

      {error ? <Banner tone="danger" icon="alert" title="Couldn't submit" message={error} /> : null}

      <ObField label="Business name" value={businessName} onChangeText={setBusinessName} placeholder="Ikeja Fresh Mart" autoCapitalize="words" />
      <ObField label="CAC registration number" value={cacNumber} onChangeText={setCacNumber} placeholder="RC 1234567" autoCapitalize="characters" hint="Optional for now - Afrizone will confirm this during the audit." />
      <ObField label="TIN" value={tin} onChangeText={setTin} placeholder="12345678-0001" hint="Optional for now." />
      <ObField label="Store address" value={address} onChangeText={setAddress} placeholder="14 Awolowo Way, Ikeja, Lagos" />
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  tagRow: { alignItems: 'flex-end' },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    color: obColors.navy,
    backgroundColor: obColors.sand,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    overflow: 'hidden',
  },
});
