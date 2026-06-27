import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
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
    lightColor: '#C2502E', // brand clay
    sound: 'default',
  });
}

/**
 * Request push permission and return the Expo push token string,
 * or null if permission denied or running on a simulator.
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

  try {
    const result = await Notifications.getExpoPushTokenAsync();
    return result.data;
  } catch {
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
