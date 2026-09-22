import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Icon } from './Icon';
import { obColors, obRadii } from '../onboarding/onboardingTheme';
import { api, ApiError } from '../api/client';

/**
 * A single document-capture step: camera/library picker, thumbnail, upload
 * progress, and a "retake" link once done. Shared by the first-time
 * onboarding flow (app/(auth)/id-upload.tsx, selfie.tsx, courier-setup.tsx)
 * and the standalone re-verification wizard (app/(auth)/kyc.tsx) - extracted
 * from the latter so both call the same upload logic instead of two copies
 * drifting apart.
 *
 * There used to be a `variant` prop: 'glass' for kyc.tsx's frosted card and
 * 'flat' for the plain dashed dropzone from afrizone-onboarding-screens.html.
 * Once kyc.tsx was restyled every caller passed 'flat', leaving the glass
 * branch unreachable, so the prop and the frosted look are gone - along with
 * the GlassCard they were the last user of.
 */
export function KycUploadStep({
  icon,
  title,
  sub,
  docType,
  preferCamera,
  allowPdf,
  docId,
  onUploaded,
}: {
  icon: 'id' | 'camera';
  title: string;
  sub: string;
  docType: 'ID' | 'SELFIE' | 'DOCS';
  preferCamera?: boolean;
  /** Supporting documents may be a PDF (a CV, a certificate); ID photos may not. */
  allowPdf?: boolean;
  docId: string | null;
  onUploaded: (id: string) => void;
}) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function pick(fromCamera: boolean) {
    setUploadError(null);

    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setUploadError('Camera permission denied. Enable it in Settings.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setUploadError('Photo library permission denied. Enable it in Settings.');
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: fromCamera && docType === 'SELFIE' ? [1, 1] : [4, 3],
    };

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled) return;

    const asset = result.assets[0];
    setLocalUri(asset.uri);
    setUploading(true);

    try {
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const doc = await api.uploadKycDocument({
        docType,
        uri: asset.uri,
        mimeType: asset.mimeType ?? `image/${ext}`,
        filename: asset.fileName ?? `${docType.toLowerCase()}.${ext}`,
      });
      onUploaded(doc.id);
    } catch (e) {
      setUploadError(e instanceof ApiError || e instanceof Error ? e.message : 'Upload failed. Try again.');
      setLocalUri(null);
    } finally {
      setUploading(false);
    }
  }

  /**
   * Pick a PDF (or image) from the device's files, for supporting documents
   * like a CV or a certificate. Separate from pick(), which uses the image
   * picker and cannot return a PDF at all.
   */
  async function pickDocument() {
    setUploadError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    // A PDF has no thumbnail to show, so only set a preview for images.
    setLocalUri(asset.mimeType === 'application/pdf' ? null : asset.uri);
    setUploading(true);
    try {
      const doc = await api.uploadKycDocument({
        docType,
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'application/pdf',
        filename: asset.name ?? `${docType.toLowerCase()}.pdf`,
      });
      onUploaded(doc.id);
    } catch (e) {
      setUploadError(e instanceof ApiError || e instanceof Error ? e.message : 'Upload failed. Try again.');
      setLocalUri(null);
    } finally {
      setUploading(false);
    }
  }

  const done = !!docId;

  const pickButtons = (
    <>
      {preferCamera ? (
        <Pressable style={styles.pickBtn} onPress={() => void pick(true)} disabled={uploading}>
          <Icon name="camera" size={18} color={obColors.navy} />
          <Text style={styles.pickBtnText}>Take photo</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.pickBtn} onPress={() => void pick(false)} disabled={uploading}>
        <Icon name="id" size={18} color={obColors.navy} />
        <Text style={styles.pickBtnText}>
          {preferCamera ? 'Choose from library' : 'Take photo / library'}
        </Text>
      </Pressable>
      {!preferCamera ? (
        <Pressable style={styles.pickBtn} onPress={() => void pick(true)} disabled={uploading}>
          <Icon name="camera" size={18} color={obColors.navy} />
          <Text style={styles.pickBtnText}>Camera</Text>
        </Pressable>
      ) : null}
      {allowPdf ? (
        <Pressable style={styles.pickBtn} onPress={() => void pickDocument()} disabled={uploading}>
          <Icon name="id" size={18} color={obColors.navy} />
          <Text style={styles.pickBtnText}>Upload PDF</Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.h2}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>

      {/* Thumbnail once picked */}
      {localUri ? (
        <View style={styles.thumbWrap}>
          <Image source={{ uri: localUri }} style={styles.thumb} resizeMode="cover" />
          {uploading ? (
            <View style={styles.thumbOverlay}>
              <ActivityIndicator color={obColors.white} />
              <Text style={styles.thumbOverlayText}>Uploading…</Text>
            </View>
          ) : done ? (
            <View style={[styles.thumbOverlay, { backgroundColor: 'rgba(33,91,59,0.72)' }]}>
              <Icon name="check-circle" size={32} color={obColors.white} />
              <Text style={styles.thumbOverlayText}>Uploaded</Text>
            </View>
          ) : null}
        </View>
      ) : (
        // afrizone-onboarding-screens.html's `.dropzone`: plain white, dashed
        // border, no frosted-glass treatment.
        <View style={[styles.dropzone, done && styles.dropzoneDone]}>
          <Icon name={done ? 'check-circle' : icon} size={20} color={done ? obColors.forest : obColors.navy} />
          <Text style={styles.dropText}>
            {done ? 'Document uploaded' : 'Tap below to add your document'}
          </Text>
        </View>
      )}

      {uploadError ? <Text style={styles.uploadErr}>{uploadError}</Text> : null}

      {/* Action buttons: always shown so user can retake */}
      {!done && <View style={styles.pickRow}>{pickButtons}</View>}

      {done && !uploading ? (
        <Pressable onPress={() => { setLocalUri(null); void pick(preferCamera ?? false); }}>
          <Text style={styles.retakeLink}>Retake / change</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h2: { fontFamily: 'Raleway_800ExtraBold', color: obColors.navy, fontSize: 16 },
  sub: { color: obColors.textMut, fontSize: 13, lineHeight: 19 },
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: obColors.line,
    borderRadius: obRadii.dropzone,
    backgroundColor: obColors.white,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  dropzoneDone: { borderColor: obColors.mgreen },
  dropText: { color: obColors.textMut, fontSize: 12.5, textAlign: 'center' },
  thumbWrap: { width: '100%', height: 200, borderRadius: obRadii.card, overflow: 'hidden', position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,30,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  thumbOverlayText: { color: obColors.white, fontWeight: '800', fontSize: 13.5 },
  pickRow: { flexDirection: 'row', gap: 10, flexWrap: Platform.OS === 'web' ? 'wrap' : 'nowrap' },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: obColors.white,
    borderWidth: 1.3,
    borderColor: obColors.line,
    borderRadius: obRadii.field,
    paddingVertical: 13,
    minWidth: 100,
  },
  pickBtnText: { color: obColors.navy, fontWeight: '800', fontSize: 12.5 },
  uploadErr: { color: obColors.dangerInk, fontSize: 12.5, fontWeight: '600' },
  retakeLink: { color: obColors.textMut, fontSize: 12.5, textDecorationLine: 'underline', textAlign: 'center' },
});
