/**
 * The worker's documents: what they have sent, where each one stands, and what
 * to do about the ones that were turned down.
 *
 * This is the screen that makes the review loop honest. A rejection is only
 * useful if the person can see the reason and act on it, and the reason shown
 * here is the exact text the reviewer chose - not a status word.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Modal, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { LoadingState, ErrorState, EmptyState } from '../../src/components/Feedback';
import { colors, spacing, type, radii, fontFamily } from '../../src/theme';
import { api, ApiError } from '../../src/api/client';
import { useAsync } from '../../src/lib/useAsync';
import { formatDateWithYear } from '../../src/lib/format';
import type { Credential, CredentialType } from '../../src/api/types';

export default function CredentialsScreen() {
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
    <Screen
      title="Your documents"
      subtitle={credentials.length ? `${credentials.length} on file` : 'Licences, certificates, CV'}
      back
      onRefresh={list.reload}
      refreshing={list.loading && !!list.data}
    >
      <Card style={styles.explainer}>
        <Icon name="shield" size={15} color={colors.goldInk} />
        <Text style={styles.explainerText}>
          Only documents we have checked can unlock locked work. Send a clear photo or PDF and we
          will review it.
        </Text>
      </Card>

      {list.loading && !list.data ? (
        <LoadingState label="Loading your documents…" />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : credentials.length === 0 ? (
        <EmptyState
          icon="id"
          title="Nothing on file yet"
          message="Add a licence, certificate or your CV to unlock more work."
        />
      ) : (
        <View style={styles.list}>
          {credentials.map((c: Credential) => (
            <CredentialCard key={c.id} credential={c} onChanged={list.reload} />
          ))}
        </View>
      )}

      <Button
        label="Add a document"
        icon="camera"
        onPress={() => setPicking(true)}
        style={{ marginTop: spacing.lg }}
      />

      {/* Choose which kind of document first: what a credential needs from the
          worker depends entirely on its type. */}
      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)} />
        <View style={styles.sheet}>
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
                <Icon name="chevron-right" size={16} color={colors.textMuted} />
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
    </Screen>
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
    <Card style={styles.card}>
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
          <Icon name="alert" size={13} color={colors.dangerInk} />
          <Text style={styles.reasonText}>{credential.rejectionReason}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {needsAction ? (
        <Text style={styles.actionHint}>Remove this and add it again with a clearer copy.</Text>
      ) : null}

      <Pressable onPress={remove} disabled={busy} style={styles.removeBtn}>
        <Text style={styles.removeText}>{busy ? 'Removing…' : 'Remove'}</Text>
      </Pressable>
    </Card>
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
      <View style={styles.sheet}>
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
                placeholderTextColor={colors.textMuted}
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
                placeholderTextColor={colors.textMuted}
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
                placeholderTextColor={colors.textMuted}
              />
            </>
          ) : null}

          {type.requiresFile ? (
            <>
              <Text style={styles.label}>The document itself</Text>
              {documentId ? (
                <View style={styles.attached}>
                  <Icon name="check-circle" size={15} color={colors.moneyInk} />
                  <Text style={styles.attachedText}>Attached</Text>
                </View>
              ) : (
                <View style={styles.uploadRow}>
                  <Button
                    label="Photo"
                    icon="camera"
                    variant="ghost"
                    onPress={attachPhoto}
                    loading={uploading}
                  />
                  <Button label="PDF" icon="id" variant="ghost" onPress={attachPdf} loading={uploading} />
                </View>
              )}
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button label="Send for checking" onPress={submit} loading={busy} disabled={missing || busy} />
            <Button label="Cancel" variant="ghost" onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  explainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderColor: colors.amberSoft,
    marginBottom: spacing.md,
  },
  explainerText: { flex: 1, color: colors.text, fontSize: type.size.sm, lineHeight: 19 },
  list: { gap: spacing.sm },
  card: { gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: type.size.base, fontFamily: fontFamily.bold },
  cardType: { color: colors.textMuted, fontSize: type.size.xs, marginTop: 2 },
  meta: { color: colors.textMuted, fontSize: type.size.sm },
  metaWarn: { color: colors.goldInk },
  reason: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.input,
    padding: spacing.sm,
  },
  reasonText: { flex: 1, color: colors.dangerInk, fontSize: type.size.sm, lineHeight: 18 },
  actionHint: { color: colors.textMuted, fontSize: type.size.xs },
  removeBtn: { alignSelf: 'flex-start' },
  removeText: { color: colors.dangerInk, fontSize: type.size.sm, fontFamily: fontFamily.bold },
  error: { color: colors.dangerInk, fontSize: type.size.sm },
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 100,
    backgroundColor: colors.line,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: type.size.xl,
    fontFamily: fontFamily.extrabold,
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  typeName: { color: colors.text, fontSize: type.size.base },
  typeHint: { color: colors.textMuted, fontSize: type.size.xs, marginTop: 2 },
  label: {
    color: colors.text,
    fontSize: type.size.sm,
    fontFamily: fontFamily.bold,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: type.size.base,
  },
  uploadRow: { flexDirection: 'row', gap: spacing.sm },
  attached: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.moneySoft,
    borderRadius: radii.input,
    padding: spacing.sm,
  },
  attachedText: { color: colors.moneyInk, fontSize: type.size.sm, fontFamily: fontFamily.bold },
});
