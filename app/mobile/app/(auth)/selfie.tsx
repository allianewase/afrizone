import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { KycUploadStep } from '../../src/components/KycUpload';
import { Banner } from '../../src/components/Feedback';
import { ObScreen } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useAuth } from '../../src/auth/AuthContext';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { submitOnboarding, ApiError } from '../../src/onboarding/submit';

/**
 * Onboarding screen 08, "Take a selfie". The dark gradient square with a
 * dashed face-guide oval is the mock's own graphic, reproduced here as
 * guidance art - decorative, not a live camera preview (this app has no
 * embedded camera-feed component anywhere; capture happens through the OS
 * camera via the real upload control below it, same as ID upload). There is
 * no separate client-side liveness SDK to wire up either: Smile Identity
 * does document + liveness verification server-side once this and the ID
 * photo are uploaded (see app/server/src/services/smileIdentity.ts).
 */
export default function SelfieScreen() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const { state, update } = useOnboarding();
  const [selfieDocId, setSelfieDocId] = useState<string | null>(state.selfieDocId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    if (!selfieDocId || busy) return;
    update({ selfieDocId });

    if (state.accountType === 'COURIER') {
      router.push('/(auth)/courier-setup');
      return;
    }
    if (state.accountType === 'STORE') {
      router.push('/(auth)/store-details');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const outcome = await submitOnboarding({ ...state, selfieDocId }, updateUser);
      if (outcome.status === 'VERIFIED') {
        router.replace('/(auth)/verified');
      } else {
        router.replace({ pathname: '/(auth)/submitted', params: { status: outcome.status, note: outcome.note ?? '' } });
      }
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not submit verification.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ObScreen
      onBack={() => router.back()}
      eyebrow="Identity · 3 of 3"
      title="Take a selfie"
      primaryLabel={state.accountType === 'INDIVIDUAL' ? 'Submit for review' : 'Continue'}
      onPrimary={onContinue}
      primaryDisabled={!selfieDocId || busy}
      primaryLoading={busy}
    >
      {error ? <Banner tone="danger" icon="alert" title="Couldn't submit" message={error} /> : null}

      <LinearGradient colors={['#2a2a3d', '#111119']} style={styles.cam}>
        <View style={styles.oval} />
        <Text style={styles.tip}>Center your face in the frame</Text>
      </LinearGradient>

      <KycUploadStep
        variant="flat"
        icon="camera"
        title="Selfie photo"
        sub="Clear, well-lit photo of your face. Use the front camera, centered in the frame."
        docType="SELFIE"
        preferCamera
        docId={selfieDocId}
        onUploaded={setSelfieDocId}
      />
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  cam: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  oval: { width: '64%', height: '78%', borderWidth: 2.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.55)', borderRadius: 999 },
  tip: { position: 'absolute', bottom: 10, fontSize: 11, color: obColors.white, opacity: 0.85 },
});
