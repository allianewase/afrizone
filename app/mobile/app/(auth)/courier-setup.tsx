import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, LoadingState, ErrorState } from '../../src/components/Feedback';
import { KycUploadStep } from '../../src/components/KycUpload';
import { ObScreen, ObChip, ObField } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { api } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { useAuth } from '../../src/auth/AuthContext';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { submitOnboarding, ApiError } from '../../src/onboarding/submit';
import type { CourierReadiness } from '../../src/api/types';

/**
 * Onboarding screen 10, Courier's role-specific step: what to deliver on,
 * via the real GET /me/courier + POST /me/courier/vehicle pair
 * app/profile/courier.tsx already uses post-signup - moved earlier into
 * onboarding since a courier can't be given deliveries without it
 * (Blueprint SS3.2). Vehicle types come from the server (data-driven), not
 * hardcoded Bike/Car/Van like the mock.
 *
 * Licence number is collected as a document photo, not a text field: there
 * is no bare "licence number" field anywhere in the API, only the generic
 * document upload every credential already goes through. Insurance is the
 * same upload, marked optional.
 */
export default function CourierSetupScreen() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const { state, update } = useOnboarding();
  const load = useAsync<CourierReadiness>((signal) => api.courierReadiness(signal), []);

  const [vehicleType, setVehicleType] = useState('');
  const [plate, setPlate] = useState('');
  const [licenceDocId, setLicenceDocId] = useState<string | null>(null);
  const [insuranceDocId, setInsuranceDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (load.data && !vehicleType) setVehicleType(load.data.vehicle?.type ?? '');
  }, [load.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (load.loading && !load.data) {
    return (
      <ObScreen onBack={() => router.back()} title="Set up dispatch profile">
        <LoadingState />
      </ObScreen>
    );
  }
  if (load.error && !load.data) {
    return (
      <ObScreen onBack={() => router.back()} title="Set up dispatch profile" primaryLabel="Retry" onPrimary={load.reload}>
        <ErrorState message={load.error} onRetry={load.reload} />
      </ObScreen>
    );
  }

  const vehicleTypes = load.data?.vehicleTypes ?? [];
  const chosen = vehicleTypes.find((v) => v.value === vehicleType);
  const needsPlate = chosen?.requiresPlate ?? false;
  const canContinue = !!vehicleType && (!needsPlate || plate.trim().length > 0) && !!licenceDocId;

  async function onContinue() {
    if (!canContinue || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveCourierVehicle(vehicleType, needsPlate ? plate.trim() : null);
      update({ docsDocId: licenceDocId });
      const outcome = await submitOnboarding({ ...state, docsDocId: licenceDocId }, updateUser);
      if (outcome.status === 'VERIFIED') {
        router.replace('/(auth)/verified');
      } else {
        router.replace({ pathname: '/(auth)/submitted', params: { status: outcome.status, note: outcome.note ?? '' } });
      }
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ObScreen
      onBack={() => router.back()}
      eyebrow="Vehicle details"
      title="Set up dispatch profile"
      primaryLabel="Continue"
      onPrimary={onContinue}
      primaryDisabled={!canContinue}
      primaryLoading={busy}
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn't save" message={error} /> : null}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: obColors.textMut }}>What do you deliver on?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {vehicleTypes.map((v) => (
            <ObChip
              key={v.value}
              label={v.label}
              selected={v.value === vehicleType}
              onPress={() => { setVehicleType(v.value); setError(null); }}
            />
          ))}
        </View>
      </View>

      {needsPlate ? (
        <ObField label="Plate number" value={plate} onChangeText={setPlate} placeholder="ABC 123 DE" autoCapitalize="characters" autoCorrect={false} />
      ) : null}

      <KycUploadStep
        icon="id"
        title="Driver's licence"
        sub="A clear photo of your licence."
        docType="DOCS"
        docId={licenceDocId}
        onUploaded={setLicenceDocId}
      />

      <KycUploadStep
        icon="id"
        title="Proof of insurance (optional)"
        sub="If you have it - not required to continue."
        docType="DOCS"
        allowPdf
        docId={insuranceDocId}
        onUploaded={setInsuranceDocId}
      />
    </ObScreen>
  );
}
