import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { KycUploadStep } from '../../src/components/KycUpload';
import { ObScreen, ObChip } from '../../src/onboarding/ObUI';
import { obColors } from '../../src/onboarding/onboardingTheme';
import { useOnboarding } from '../../src/onboarding/OnboardingContext';
import { ID_TYPES, TIERS } from '../../src/lib/kyc';

/**
 * Onboarding screen 07, "Upload your ID" - folding in what used to be
 * app/(auth)/kyc.tsx's separate 'docs' step (the tier-specific supporting
 * document), since both are "upload a document" and the tier was already
 * chosen on the previous screen.
 */
export default function IdUploadScreen() {
  const router = useRouter();
  const { state, update } = useOnboarding();
  const [idType, setIdType] = useState<string | null>(state.idType);
  const [idDocId, setIdDocId] = useState<string | null>(state.idDocId);
  const [docsDocId, setDocsDocId] = useState<string | null>(state.docsDocId);

  const selectedTier = TIERS.find((t) => t.key === state.tier);
  const canContinue = !!idDocId && !!idType && !!docsDocId;

  function onContinue() {
    if (!canContinue) return;
    update({ idType, idDocId, docsDocId });
    router.push('/(auth)/selfie');
  }

  return (
    <ObScreen
      onBack={() => router.back()}
      eyebrow="Identity · 2 of 3"
      title="Upload your ID"
      primaryLabel="Continue"
      onPrimary={onContinue}
      primaryDisabled={!canContinue}
    >
      <View style={{ gap: 8 }}>
        <Text style={styles.label}>ID type</Text>
        <View style={styles.chipRow}>
          {ID_TYPES.map((t) => (
            <ObChip key={t.key} label={t.label} selected={idType === t.key} onPress={() => setIdType(t.key)} />
          ))}
        </View>
      </View>

      <KycUploadStep
        variant="flat"
        icon="id"
        title="Your ID document"
        sub="NIN slip, voter's card, or passport photo page. Make sure all four corners are visible and text is readable."
        docType="ID"
        docId={idDocId}
        onUploaded={setIdDocId}
      />

      <KycUploadStep
        variant="flat"
        icon="id"
        title={selectedTier ? `${selectedTier.key} documents` : 'Tier documents'}
        sub={selectedTier?.docLabel ?? 'Supporting documents for your tier.'}
        docType="DOCS"
        allowPdf
        docId={docsDocId}
        onUploaded={setDocsDocId}
      />
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: obColors.textMut },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
