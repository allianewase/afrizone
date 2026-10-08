/**
 * Proof-of-work photos for one step of a job (server: services/evidence.ts).
 *
 * CAMERA ONLY, NEVER THE GALLERY. A photo picked from the gallery could be from
 * last week or another job, and the whole point is that it was taken here, now.
 * The position is read at the moment the shutter closes and sent with it.
 *
 * WHAT A STEP NEEDS COMES FROM THE SERVER. The panel asks GET /me/evidence and
 * shows that step's count; nothing here knows that an audit wants three. A step
 * the job does not ask for renders nothing at all.
 *
 * A FLAG IS SHOWN, NOT HIDDEN, AND NOT TREATED AS A FAILURE. "Taken 600 m from
 * the shop" under a thumbnail lets a courier who is in fact at the wrong
 * branch notice while they can still do something about it; the photo still
 * counts, and a reviewer decides.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Icon } from './Icon';
import { obColors, obRadii } from '../onboarding/onboardingTheme';
import { api, ApiError } from '../api/client';
import { API_BASE_URL, SECURE_TOKEN_KEY } from '../api/config';
import { getItem } from '../lib/storage';
import type { Evidence, EvidenceStage } from '../api/types';

/** The server answers /api/...; API_BASE_URL already ends in /api. */
const ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Take one photo and send it. Null when the worker backed out of the camera.
 * Exported for the clock, which needs the photo's id rather than a panel.
 */
export async function takeEvidencePhoto(taskId: string, stage: EvidenceStage): Promise<Evidence | null> {
  const cam = await ImagePicker.requestCameraPermissionsAsync();
  if (cam.status !== 'granted') {
    throw new Error('Allow the camera in Settings to take the photo this job needs.');
  }
  const shot = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    // Enough to read a shelf label; small enough to send over a weak signal.
    quality: 0.6,
    allowsEditing: false,
    exif: false,
  });
  if (shot.canceled) return null;
  const capturedAt = new Date();

  // The fix is best effort: a photo without a position still counts, and the
  // server flags it rather than this screen refusing to send it.
  let at: { lat: number; lng: number; accuracy: number | null } | null = null;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      at = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
    }
  } catch {
    // No fix. Sent without one.
  }

  const asset = shot.assets[0];
  return api.uploadEvidence({
    taskId,
    stage,
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    at,
    capturedAt,
  });
}

/** A thumbnail behind the API's auth, which a bare <Image uri> cannot send. */
function Thumb({ e, token }: { e: Evidence; token: string | null }) {
  return (
    <View style={styles.thumbWrap}>
      {token ? (
        <Image
          source={{ uri: `${ORIGIN}${e.url}`, headers: { Authorization: `Bearer ${token}` } }}
          style={styles.thumb}
        />
      ) : (
        <View style={styles.thumb} />
      )}
      {e.flagged ? (
        <Text style={styles.flag} numberOfLines={2}>
          {e.flags[0]}
        </Text>
      ) : (
        <View style={styles.okRow}>
          <Icon name="check-circle" size={11} color={obColors.forest} />
          <Text style={styles.ok}>{e.distance ? `${e.distance} from site` : 'Received'}</Text>
        </View>
      )}
    </View>
  );
}

export default function EvidencePanel({
  taskId,
  stage,
  onReady,
}: {
  taskId: string;
  stage: EvidenceStage;
  /** Told whether this step has all the photos it needs, whenever that changes. */
  onReady?: (ready: boolean) => void;
}) {
  const [needed, setNeeded] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [items, setItems] = useState<Evidence[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    void getItem(SECURE_TOKEN_KEY).then(setToken);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.myEvidence(taskId);
      const req = res.requirements.find((r) => r.stage === stage);
      setNeeded(req?.count ?? 0);
      setLabel(req?.label ?? '');
      setItems(res.evidence.filter((e) => e.stage === stage));
    } catch {
      // Unknown is not "none needed": leave it null and let the server's
      // refusal, if any, say what is missing.
    }
  }, [taskId, stage]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = needed !== null && items.length >= needed;
  useEffect(() => {
    if (needed !== null) onReady?.(ready);
    // onReady is the parent's setter; it is only told when the answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, needed]);

  async function take() {
    setBusy(true);
    setError(null);
    try {
      const photo = await takeEvidencePhoto(taskId, stage);
      if (photo) setItems((cur) => [...cur, photo]);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not send the photo. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!needed) return null;
  const left = Math.max(0, needed - items.length);

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Icon name={ready ? 'check-circle' : 'camera'} size={15} color={ready ? obColors.forest : obColors.amberInk} />
        <Text style={styles.title}>
          {needed === 1 ? `Photo: ${label.toLowerCase()}` : `Photos: ${label.toLowerCase()} (${items.length} of ${needed})`}
        </Text>
      </View>

      {items.length > 0 ? (
        <View style={styles.thumbs}>
          {items.map((e) => (
            <Thumb key={e.id} e={e} token={token} />
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>
          Taken here, with your location. It is how Afrizone knows the job was done without phoning you.
        </Text>
      )}

      {!ready || items.length === 0 ? (
        <Pressable onPress={take} disabled={busy} style={[styles.button, busy && { opacity: 0.6 }]}>
          <Icon name="camera" size={16} color={obColors.white} />
          <Text style={styles.buttonText}>
            {busy ? 'Sending…' : left > 1 ? `Take photo (${left} to go)` : 'Take photo'}
          </Text>
        </Pressable>
      ) : (
        <Pressable onPress={take} disabled={busy} style={styles.again}>
          <Text style={styles.againText}>{busy ? 'Sending…' : 'Add another'}</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: obColors.sand,
    borderRadius: obRadii.field,
    padding: 13,
    marginTop: 12,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 13, fontWeight: '800', color: obColors.navy, flexShrink: 1 },
  hint: { fontSize: 12, color: obColors.textMut, lineHeight: 17 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 92, gap: 4 },
  thumb: { width: 92, height: 92, borderRadius: 10, backgroundColor: obColors.line },
  flag: { fontSize: 10.5, color: obColors.amberInk, fontWeight: '700', lineHeight: 13 },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ok: { fontSize: 10.5, color: obColors.forest, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: obRadii.pill,
    backgroundColor: obColors.navy,
  },
  buttonText: { fontFamily: 'Raleway_800ExtraBold', fontSize: 14, color: obColors.white },
  again: { alignItems: 'center', paddingVertical: 6 },
  againText: { fontSize: 12.5, fontWeight: '800', color: obColors.textMut },
  error: { fontSize: 12, color: obColors.dangerInk },
});
