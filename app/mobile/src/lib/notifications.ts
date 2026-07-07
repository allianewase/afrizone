import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '../api/client';

/**
 * Configure how notifications appear when the app is in the foreground.
 * Must be called at the module level (before any hooks), typically in _layout.tsx.
 */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Set up the Android notification channel (required for SDK 26+).
 * Safe to call multiple times — Expo is idempotent on channel creation.
 */
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Afrizone alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C2502E',
    sound: 'default',
  });
}

/**
 * Resolve the EAS project ID from env var or app.json extra.
 * Required by getExpoPushTokenAsync() in Expo SDK 49+.
 * Set EXPO_PUBLIC_EAS_PROJECT_ID or add extra.eas.projectId to app.json.
 */
function getProjectId(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId || undefined;
}

/**
 * Request push permission and return the Expo push token string,
 * or null if permission denied, running on a simulator, or not configured.
 */
export async function getExpoPushToken(): Promise<string | null> {
  // Push tokens only work on physical devices.
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = getProjectId();
  if (!projectId) {
    if (__DEV__) {
      console.warn(
        '[Afrizone] Push token registration skipped: EAS project ID not configured.\n' +
          'Run `eas init` to get one, then add it to app.json under extra.eas.projectId\n' +
          'or set EXPO_PUBLIC_EAS_PROJECT_ID in app/mobile/.env.'
      );
    }
    return null;
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return result.data;
  } catch (err) {
    if (__DEV__) console.warn('[Afrizone] getExpoPushTokenAsync failed:', err);
    return null;
  }
}

/**
 * Full registration flow: get token and upload it to the server.
 * Fire-and-forget — errors are swallowed (push is non-critical).
 */
export async function registerPushToken(): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;
    await api.registerPushToken(token);
  } catch {
    // Push registration failure must never crash the app.
  }
}

/**
 * Subscribe to AppState changes and re-register the push token whenever
 * the app comes to the foreground. Tokens can rotate; this keeps the server
 * up to date. Returns an unsubscribe function.
 */
export function subscribeToTokenRefresh(onToken?: (token: string) => void): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void (async () => {
        try {
          const token = await getExpoPushToken();
          if (!token) return;
          await api.registerPushToken(token);
          onToken?.(token);
        } catch {
          // non-critical
        }
      })();
    }
  });
  return () => sub.remove();
}
