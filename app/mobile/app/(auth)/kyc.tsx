import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { TierBadge } from '../../src/components/TierBadge';
import { Banner } from '../../src/components/Feedback';
import { KycUploadStep } from '../../src/components/KycUpload';
import { AppBackHeader } from '../../src/appui/AppUI';
import { ObField, ObChip, ObButton, ObCheckCircle } from '../../src/onboarding/ObUI';
import { obColors, obRadii } from '../../src/onboarding/onboardingTheme';
import { api, ApiError } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { NIGERIAN_BANKS } from '../../src/lib/banks';
import { ID_TYPES, TIERS } from '../../src/lib/kyc';
import type { Tier } from '../../src/api/types';

/**
 * Onboarding / KYC stepper (AUTH_FLOW §B). Steps (8): name+email → tier →
 * ID upload → selfie → tier docs → TIN → bank → review. Real image uploads via
 * expo-image-picker → POST /api/me/kyc/documents. Final step submits metadata
 * to POST /api/me/kyc/submit (kycStatus = PENDING).
 *
 * Restyled to the same afrizone-onboarding-screens.html chrome as the rest of
 * (auth)/ - ObField/ObChip/ObButton/ObCheckCircle, and the same KycUploadStep
 * dropzone id-upload.tsx and selfie.tsx use. This
 * is a standalone re-verification wizard reached later from Profile/Home
 * (not the first-time OnboardingContext-driven flow those two screens are
 * part of), so it keeps its own local step state exactly as before - only
 * the JSX/styling changed.
 *
 * TierBadge is left on its own (old-themed) color mapping, same as
 * choose-tier.tsx's identical tier cards - it's shared, real per-tier tone
 * logic that isn't worth forking twice for one restyle pass.
 */
type StepKey =
  | 'name'
  | 'tier'
  | 'id'
  | 'selfie'
  | 'docs'
  | 'tin'
  | 'bank'
  | 'review'
  | 'submitted';

const STEPS: StepKey[] = [
  'name',
  'tier',
  'id',
  'selfie',
  'docs',
  'tin',
  'bank',
  'review',
  'submitted',
];
const STEP_LABEL: Record<StepKey, string> = {
  name: 'Your details',
  tier: 'Choose tier',
  id: 'ID document',
  selfie: 'Liveness',
  docs: 'Tier documents',
  tin: 'Tax ID',
  bank: 'Bank account',
  review: 'Review',
  submitted: 'Submitted',
};

export default function KycScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser, updateProfile } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [tier, setTier] = useState<Tier | null>(null);
  const [idDocId, setIdDocId] = useState<string | null>(null);
  const [idType, setIdType] = useState<string | null>(null);
  const [selfieDocId, setSelfieDocId] = useState<string | null>(null);
  const [docsDocId, setDocsDocId] = useState<string | null>(null);
  const [tin, setTin] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [acct, setAcct] = useState('');
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING');
  const [submittedNote, setSubmittedNote] = useState<string | null>(null);

  const selectedTier = TIERS.find((t) => t.key === tier);
  const selectedBank = NIGERIAN_BANKS.find((b) => b.code === bankCode);

  function maskedBank(): string {
    const last2 = acct.replace(/\D/g, '').slice(-2);
    const bankName = selectedBank?.name ?? 'Unknown Bank';
    return `${bankName} ••${last2}`;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() });
      const result = await api.submitKyc({
        tin: tin || undefined,
        bankMasked: maskedBank(),
        bankCode: bankCode || undefined,
        bankAccountNumber: acct || undefined,
        bankName: selectedBank?.name || undefined,
        tier: tier ?? undefined,
        idType: idType ?? undefined,
      });
      await updateUser({
        kycStatus: result.kycStatus,
        kycNote: result.kycNote ?? null,
        tiers: tier ? [tier] : user?.tiers ?? [],
      });
      setSubmittedStatus(result.kycStatus === 'REJECTED' || result.kycStatus === 'VERIFIED' ? result.kycStatus : 'PENDING');
      setSubmittedNote(result.kycNote ?? null);
      setStepIndex(STEPS.indexOf('submitted'));
    } catch (e) {
      const msg =
        e instanceof ApiError || e instanceof Error
          ? e.message
          : 'Could not submit verification.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (step === 'review') {
      void submit();
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
  }
  function back() {
    if (stepIndex === 0) router.back();
    else setStepIndex((i) => i - 1);
  }

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const canContinue = (() => {
    switch (step) {
      case 'name':
        return name.trim().length >= 2 && emailOk;
      case 'tier':
        return !!tier;
      case 'id':
        return !!idDocId && !!idType;
      case 'selfie':
        return !!selfieDocId;
      case 'docs':
        return !!docsDocId;
      case 'tin':
        return tin.length === 0 || tin.length >= 8;
      case 'bank':
        return !!bankCode && acct.replace(/\D/g, '').length === 10;
      default:
        return true;
    }
  })();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 110 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppBackHeader title={user?.kycStatus === 'REJECTED' ? 'Re-verify' : 'Get verified'} onBack={back} />

        {step !== 'submitted' ? (
          <View style={styles.rail}>
            <View style={styles.railHead}>
              <Text style={styles.railCount}>Step {stepIndex + 1} of {STEPS.length - 1}</Text>
              <Text style={styles.railLabel}>{STEP_LABEL[step]}</Text>
            </View>
            <View style={styles.railBar}>
              {STEPS.slice(0, -1).map((_, i) => (
                <View key={i} style={[styles.railSeg, i <= stepIndex && styles.railSegOn]} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 16 }}>
          {step !== 'submitted' ? (
            user?.kycStatus === 'REJECTED' ? (
              <Banner
                tone="danger"
                icon="shield"
                title="Previous verification rejected"
                message={
                  user?.kycNote ??
                  'Please update your documents and re-submit. Ensure your ID is clear and your selfie matches your ID photo.'
                }
              />
            ) : (
              <Banner
                tone="indigo"
                icon="shield"
                title="Secure verification"
                message="Your documents are uploaded securely. Name, email, tier, TIN and bank are submitted on the final step."
              />
            )
          ) : null}
          {error ? <Banner tone="danger" icon="alert" title="Couldn't submit" message={error} /> : null}

          {step === 'name' && (
            <View style={{ gap: 16 }}>
              <ObField label="Full name" value={name} onChangeText={setName} placeholder="Amaka Obi" hint="As it appears on your ID." autoCapitalize="words" />
              <ObField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                hint="For receipts and WHT statements."
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          )}

          {step === 'tier' && (
            <View style={{ gap: 12 }}>
              <Text style={styles.h2}>Choose your work tier</Text>
              {TIERS.map((t) => {
                const active = tier === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTier(t.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.tierCard, active && styles.tierCardSel]}
                  >
                    <View style={styles.tierHead}>
                      <TierBadge tier={t.key} />
                      {active ? <Icon name="check-circle" size={18} color={obColors.goldDeep} /> : null}
                    </View>
                    <Text style={styles.tierBlurb}>{t.blurb}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {step === 'id' && (
            <View style={{ gap: 16 }}>
              <View style={{ gap: 8 }}>
                <Text style={styles.fieldLabel}>ID type</Text>
                <View style={styles.chipRow}>
                  {ID_TYPES.map((t) => (
                    <ObChip key={t.key} label={t.label} selected={idType === t.key} onPress={() => setIdType(t.key)} />
                  ))}
                </View>
              </View>
              <KycUploadStep
                icon="id"
                title="Upload your ID"
                sub="NIN slip, voter's card, or passport photo page."
                docType="ID"
                docId={idDocId}
                onUploaded={setIdDocId}
              />
            </View>
          )}

          {step === 'selfie' && (
            <KycUploadStep
              icon="camera"
              title="Take a selfie"
              sub="Clear, well-lit photo of your face. Use the front camera."
              docType="SELFIE"
              preferCamera
              docId={selfieDocId}
              onUploaded={setSelfieDocId}
            />
          )}

          {step === 'docs' && (
            <KycUploadStep
              icon="id"
              title={selectedTier ? `${selectedTier.key} documents` : 'Tier documents'}
              sub={selectedTier?.docLabel ?? 'Supporting documents for your tier.'}
              docType="DOCS"
              allowPdf
              docId={docsDocId}
              onUploaded={setDocsDocId}
            />
          )}

          {step === 'tin' && (
            <ObField
              label="Tax Identification Number (TIN)"
              value={tin}
              onChangeText={setTin}
              placeholder="12345678-0001 (optional)"
              hint="Optional: you can add this later in Profile. Required for WHT statements."
              keyboardType="number-pad"
            />
          )}

          {step === 'bank' && (
            <View style={{ gap: 16 }}>
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Bank</Text>
                <Pressable
                  onPress={() => setBankPickerOpen(true)}
                  style={styles.bankPicker}
                  accessibilityRole="button"
                  accessibilityLabel="Select bank"
                >
                  <Text style={[styles.bankPickerText, !selectedBank && { color: obColors.textFaint }]}>
                    {selectedBank ? selectedBank.name : 'Select your bank…'}
                  </Text>
                  <Icon name="chevron-down" size={18} color={obColors.textMut} />
                </Pressable>
              </View>
              <ObField
                label="Account number (NUBAN)"
                value={acct}
                onChangeText={(t) => setAcct(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="0123456789"
                hint="10-digit Nigerian account number. Payouts go here (T+1)."
                keyboardType="number-pad"
                maxLength={10}
              />
              {acct.length > 0 && acct.length < 10 ? (
                <Text style={styles.acctHint}>{10 - acct.length} more digits needed</Text>
              ) : acct.length === 10 ? (
                <Text style={[styles.acctHint, { color: obColors.mgreen }]}>✓ Valid NUBAN</Text>
              ) : null}
            </View>
          )}

          {step === 'review' && (
            <View style={{ gap: 12 }}>
              <Text style={styles.h2}>Review & submit</Text>
              <View style={styles.reviewCard}>
                <ReviewRow label="Name" value={name.trim() || '—'} />
                <ReviewRow label="Email" value={email.trim() || '—'} />
                <ReviewRow label="Tier" value={tier ?? '—'} />
                <ReviewRow
                  label="ID"
                  value={idDocId ? `✓ Uploaded (${ID_TYPES.find((t) => t.key === idType)?.label ?? idType})` : 'Missing'}
                />
                <ReviewRow label="Selfie" value={selfieDocId ? '✓ Uploaded' : 'Missing'} />
                <ReviewRow label="Tier docs" value={docsDocId ? '✓ Uploaded' : 'Missing'} />
                <ReviewRow label="TIN" value={tin || '—'} />
                <ReviewRow label="Bank" value={bankCode ? maskedBank() : '—'} last />
              </View>
              <Text style={styles.muted}>
                Submitting sets your status to <Text style={{ fontWeight: '700', color: obColors.text }}>In review</Text>.
                An admin verifies your tier before you can apply to tasks.
              </Text>
            </View>
          )}

          {step === 'submitted' && submittedStatus === 'REJECTED' && (
            <View style={styles.submitted}>
              <ObCheckCircle tone="danger" icon="alert" />
              <Text style={styles.h1}>Verification not approved</Text>
              <Text style={styles.muted}>
                {submittedNote ??
                  'Your ID and selfie did not pass automated verification. Please re-check your documents and try again.'}
              </Text>
            </View>
          )}

          {step === 'submitted' && submittedStatus === 'VERIFIED' && (
            <View style={styles.submitted}>
              <ObCheckCircle tone="gold" />
              <Text style={styles.h1}>Identity verified</Text>
              <Text style={styles.muted}>
                Thanks{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}. Your identity has been{' '}
                <Text style={{ fontWeight: '700', color: obColors.goldDeep }}>automatically verified</Text>.
                An admin still needs to approve your tier before you can apply to tasks.
              </Text>
            </View>
          )}

          {step === 'submitted' && submittedStatus === 'PENDING' && (
            <View style={styles.submitted}>
              <ObCheckCircle tone="gold" />
              <Text style={styles.h1}>Verification in review</Text>
              <Text style={styles.muted}>
                Thanks{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}. Your verification is{' '}
                <Text style={{ fontWeight: '700', color: obColors.goldDeep }}>In review</Text>. You can
                explore tasks now; applying unlocks once an admin approves your tier.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bank picker sheet */}
      <Modal
        visible={bankPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBankPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setBankPickerOpen(false)} />
        <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.pickerTitle}>Select bank</Text>
          <FlatList
            data={NIGERIAN_BANKS}
            keyExtractor={(b) => b.code}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { setBankCode(item.code); setBankPickerOpen(false); }}
                style={[styles.bankItem, bankCode === item.code && styles.bankItemActive]}
              >
                <Text style={[styles.bankItemText, bankCode === item.code && { color: obColors.navy, fontWeight: '700' }]}>
                  {item.name}
                </Text>
                {bankCode === item.code ? <Icon name="check" size={18} color={obColors.goldDeep} /> : null}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: obColors.line }} />}
          />
        </View>
      </Modal>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step === 'submitted' ? (
          <ObButton label="Go to Home" onPress={() => router.replace('/(tabs)/home')} />
        ) : (
          <ObButton
            label={step === 'review' ? 'Submit for review' : 'Continue'}
            onPress={next}
            disabled={!canContinue || busy}
            loading={busy}
          />
        )}
      </View>
    </View>
  );
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.reviewRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  rail: { gap: 8, marginBottom: 18 },
  railHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  railCount: { color: obColors.goldDeep, fontSize: 12.5, fontWeight: '700' },
  railLabel: { color: obColors.textMut, fontSize: 12.5 },
  railBar: { flexDirection: 'row', gap: 4 },
  railSeg: { flex: 1, height: 5, borderRadius: 100, backgroundColor: obColors.line },
  railSegOn: { backgroundColor: obColors.goldDeep },

  h1: { fontSize: 20, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, textAlign: 'center' },
  h2: { fontSize: 16.5, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: obColors.textMut },
  muted: { color: obColors.textMut, fontSize: 13.5, lineHeight: 21, textAlign: 'center' },

  tierCard: { backgroundColor: obColors.white, borderWidth: 1.3, borderColor: obColors.line, borderRadius: 14, padding: 14, gap: 8 },
  tierCardSel: { borderColor: obColors.goldDeep, backgroundColor: obColors.roleSelectedBg },
  tierHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierBlurb: { color: obColors.textMut, fontSize: 13, lineHeight: 18 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  reviewCard: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    paddingHorizontal: 16,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: obColors.line,
    gap: 16,
  },
  reviewLabel: { color: obColors.textMut, fontSize: 13.5 },
  reviewValue: { color: obColors.text, fontSize: 13.5, fontWeight: '700', flexShrink: 1, textAlign: 'right' },

  submitted: { alignItems: 'center', gap: 12, paddingTop: 40 },

  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: obColors.bg },

  bankPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.field,
    minHeight: 50,
    paddingHorizontal: 13,
  },
  bankPickerText: { fontSize: 15, color: obColors.text, flex: 1 },
  acctHint: { fontSize: 12, color: obColors.textMut, marginTop: -8 },

  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,30,0.42)' },
  pickerSheet: {
    backgroundColor: obColors.bg,
    borderTopLeftRadius: obRadii.hero,
    borderTopRightRadius: obRadii.hero,
    padding: 20,
    maxHeight: '70%',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 4, backgroundColor: obColors.line, marginBottom: 12 },
  pickerTitle: { fontSize: 18, fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, marginBottom: 8 },
  bankItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  bankItemActive: { backgroundColor: obColors.roleSelectedBg, marginHorizontal: -20, paddingHorizontal: 20 },
  bankItemText: { fontSize: 14, color: obColors.text },
});
