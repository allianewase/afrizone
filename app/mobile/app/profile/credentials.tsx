/**
 * The worker's documents: what they have sent, where each one stands, and what
 * to do about the ones that were turned down.
 *
 * This is the screen that makes the review loop honest. A rejection is only
 * useful if the person can see the reason and act on it, and the reason shown
 * here is the exact text the reviewer chose - not a status word.
 *
 * Restyled onto the navy/gold palette. The type filtering, the per-type
 * required fields, the upload round-trip and the delete are unchanged.
 *
 * Red here is `dangerInk` (6.59:1 on white, 5.67:1 on its tint), not the
 * `danger` fill, which is 4.38:1 and cannot legibly carry small text. The
 * alert glyph keeps the brighter fill, where the 3:1 floor for graphics
 * applies.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Modal, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  AppBackHeader,
  AppPrimaryButton,
  AppEmptyState,
  AppErrorState,
  AppLoadingCards,
} from '../../src/appui/AppUI';
import { Icon } from '../../src/components/Icon';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { obColors, obRadii } from '../../src/onboarding/onboardingTheme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { formatDateWithYear } from '../../src/lib/format';
import type { Credential, CredentialType } from '../../src/api/types';

export default function CredentialsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useAsync((signal) => api.myCredentials(signal));
  const types = useAsync((signal) => api.credentialTypes(signal));
  const [adding, setAdding] = useState<CredentialType | null>(null);
  const [picking, setPicking] = useState(false);

  const credentials = list.data ?? [];

  // A worker can only SUBMIT third-party documents. Afrizone-issued ones are
  // awarded by an admin from work history, so offering them here would be
  // offering something that cannot be done.
  const submittable = useMemo(
    () => (types.data ?? []).filter((t: CredentialType) => t.issuerMode !== 'AFRIZONE'),
    [types.data]
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={list.loading && !!list.data}
            onRefresh={list.reload}
            tintColor={obColors.navy}
          />
        }
      >
        <AppBackHeader title="Your documents" onBack={() => router.back()} />
        <Text style={styles.subtitle}>
          {credentials.length ? `${credentials.length} on file` : 'Licences, certificates, CV'}
        </Text>

        <View style={styles.explainer}>
          <Icon name="shield" size={15} color={obColors.orangeInk} />
          <Text style={styles.explainerText}>
            Only documents we have checked can unlock locked work. Send a clear photo or PDF and we
            will review it.
          </Text>
        </View>

        {list.loading && !list.data ? (
          <AppLoadingCards count={2} />
        ) : list.error ? (
          <AppErrorState message={list.error} onRetry={list.reload} />
        ) : credentials.length === 0 ? (
          <AppEmptyState
            icon="id"
            title="Nothing on file yet"
            message="Add a licence, certificate or your CV to unlock more work."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {credentials.map((c: Credential) => (
              <CredentialCard key={c.id} credential={c} onChanged={list.reload} />
            ))}
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <AppPrimaryButton label="Add a document" icon="camera" onPress={() => setPicking(true)} />
        </View>
      </ScrollView>

      {/* Choose which kind of document first: what a credential needs from the
          worker depends entirely on its type. */}
      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>What are you adding?</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {submittable.map((t: CredentialType) => (
              <Pressable
                key={t.id}
                style={styles.typeRow}
                onPress={() => {
                  setPicking(false);
                  setAdding(t);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.typeName}>{t.name}</Text>
                  <Text style={styles.typeHint}>
                    {t.reviewMode === 'SELF_DECLARED'
                      ? 'Kept on your profile, not checked'
                      : 'We will check this one'}
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} color={obColors.textMut} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {adding && (
        <AddCredentialSheet
          type={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            list.reload();
          }}
        />
      )}
    </View>
  );
}

function CredentialCard({ credential, onChanged }: { credential: Credential; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteCredential(credential.id);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not remove it.');
    } finally {
      setBusy(false);
    }
  }

  const needsAction = credential.state === 'REJECTED' || credential.state === 'EXPIRED';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{credential.title}</Text>
          <Text style={styles.cardType}>{credential.credentialType.name}</Text>
        </View>
        <VerifiedBadge state={credential.state} small />
      </View>

      {credential.expiresAt ? (
        <Text style={[styles.meta, credential.expiringSoon && styles.metaWarn]}>
          {credential.state === 'EXPIRED' ? 'Expired' : 'Expires'} {formatDateWithYear(credential.expiresAt)}
          {credential.expiringSoon ? ' — renew soon' : ''}
        </Text>
      ) : null}

      {/* The reviewer's own words, verbatim. A status word here would tell the
          worker nothing they can act on. */}
      {credential.rejectionReason ? (
        <View style={styles.reason}>
          <Icon name="alert" size={13} color={obColors.danger} />
          <Text style={styles.reasonText}>{credential.rejectionReason}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {needsAction ? (
        <Text style={styles.actionHint}>Remove this and add it again with a clearer copy.</Text>
      ) : null}

      <Pressable onPress={remove} disabled={busy} style={styles.removeBtn} accessibilityRole="button">
        <Text style={styles.removeText}>{busy ? 'Removing…' : 'Remove'}</Text>
      </Pressable>
    </View>
  );
}

function AddCredentialSheet({
  type,
  onClose,
  onSaved,
}: {
  type: CredentialType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(type.name);
  const [issuer, setIssuer] = useState('');
  const [reference, setReference] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attachPhoto() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      setError('Photo permission denied. Enable it in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    await upload(asset.uri, asset.mimeType ?? 'image/jpeg', asset.fileName ?? 'document.jpg');
  }

  async function attachPdf() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    await upload(asset.uri, asset.mimeType ?? 'application/pdf', asset.name ?? 'document.pdf');
  }

  async function upload(uri: string, mimeType: string, filename: string) {
    setUploading(true);
    try {
      const doc = await api.uploadKycDocument({ docType: 'CREDENTIAL', uri, mimeType, filename });
      setDocumentId(doc.id);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.addCredential({
        credentialTypeId: type.id,
        title: title.trim() || type.name,
        issuer: issuer.trim() || undefined,
        referenceNumber: reference.trim() || undefined,
        expiresAt: expiresAt.trim() || undefined,
        documentId,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not send it.');
    } finally {
      setBusy(false);
    }
  }

  // Mirrors what the server will insist on, so the worker finds out before
  // they tap rather than after.
  const missing =
    (type.requiresFile && !documentId) ||
    (type.requiresReference && !reference.trim()) ||
    (type.requiresExpiry && !expiresAt.trim());

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.grabber} />
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>{type.name}</Text>

          <Text style={styles.label}>What is it called?</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} />

          {type.issuerMode === 'THIRD_PARTY' ? (
            <>
              <Text style={styles.label}>Who issued it?</Text>
              <TextInput
                style={styles.input}
                value={issuer}
                onChangeText={setIssuer}
                placeholder={type.issuerHint ?? 'Name of the issuer'}
                placeholderTextColor={obColors.textMut}
              />
            </>
          ) : null}

          {type.requiresReference ? (
            <>
              <Text style={styles.label}>Reference number</Text>
              <TextInput
                style={styles.input}
                value={reference}
                onChangeText={setReference}
                autoCapitalize="characters"
                placeholder="As printed on the document"
                placeholderTextColor={obColors.textMut}
              />
            </>
          ) : null}

          {type.requiresExpiry ? (
            <>
              <Text style={styles.label}>Expiry date</Text>
              <TextInput
                style={styles.input}
                value={expiresAt}
                onChangeText={setExpiresAt}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={obColors.textMut}
              />
            </>
          ) : null}

          {type.requiresFile ? (
            <>
              <Text style={styles.label}>The document itself</Text>
              {documentId ? (
                <View style={styles.attached}>
                  <Icon name="check-circle" size={15} color={obColors.forest} />
                  <Text style={styles.attachedText}>Attached</Text>
                </View>
              ) : (
                <View style={styles.uploadRow}>
                  <View style={{ flex: 1 }}>
                    <AppPrimaryButton
                      label="Photo"
                      icon="camera"
                      variant="outline"
                      onPress={attachPhoto}
                      loading={uploading}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppPrimaryButton
                      label="PDF"
                      icon="id"
                      variant="outline"
                      onPress={attachPdf}
                      loading={uploading}
                    />
                  </View>
                </View>
              )}
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={{ gap: 10, marginTop: 16 }}>
            <AppPrimaryButton label="Send for checking" onPress={submit} loading={busy} disabled={missing || busy} />
            <AppPrimaryButton label="Cancel" variant="outline" onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: obColors.bg },
  subtitle: { fontSize: 13, color: obColors.textMut, marginTop: -8, marginBottom: 16 },
  explainer: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: obColors.orangeInkBg,
    borderRadius: obRadii.card,
    padding: 13,
    marginBottom: 16,
  },
  explainerText: { flex: 1, color: obColors.text, fontSize: 12.5, lineHeight: 18 },
  card: {
    backgroundColor: obColors.white,
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.card,
    borderTopRightRadius: obRadii.cardCut,
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: obColors.text, fontSize: 14, fontFamily: 'Raleway_800ExtraBold' },
  cardType: { color: obColors.textMut, fontSize: 11.5, marginTop: 2 },
  meta: { color: obColors.textMut, fontSize: 12.5 },
  metaWarn: { color: obColors.amberInk, fontWeight: '700' },
  reason: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: obColors.dangerBg,
    borderRadius: obRadii.field,
    padding: 10,
  },
  reasonText: { flex: 1, color: obColors.dangerInk, fontSize: 12.5, lineHeight: 18 },
  actionHint: { color: obColors.textMut, fontSize: 11.5 },
  removeBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  removeText: { color: obColors.dangerInk, fontSize: 12.5, fontWeight: '800' },
  error: { color: obColors.dangerInk, fontSize: 12.5 },
  backdrop: { flex: 1, backgroundColor: obColors.scrim },
  sheet: {
    backgroundColor: obColors.bg,
    borderTopLeftRadius: obRadii.hero,
    borderTopRightRadius: obRadii.hero,
    padding: 20,
    gap: 8,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 4, backgroundColor: obColors.line, marginBottom: 8 },
  sheetTitle: {
    color: obColors.navy,
    fontSize: 18,
    fontFamily: 'Raleway_800ExtraBold',
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: obColors.line,
  },
  typeName: { color: obColors.text, fontSize: 14, fontWeight: '700' },
  typeHint: { color: obColors.textMut, fontSize: 11.5, marginTop: 2 },
  label: {
    color: obColors.textMut,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: obColors.line,
    borderRadius: obRadii.field,
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: obColors.text,
    backgroundColor: obColors.white,
    fontSize: 15,
  },
  uploadRow: { flexDirection: 'row', gap: 10 },
  attached: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: obColors.mgreenBg,
    borderRadius: obRadii.field,
    padding: 12,
  },
  attachedText: { color: obColors.forest, fontSize: 13, fontWeight: '800' },
});
