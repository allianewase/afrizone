import { useCallback, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GOOGLE_CLIENT_IDS } from '../api/config';

// Required so the auth-session popup can dismiss itself and return to the app.
WebBrowser.maybeCompleteAuthSession();

export interface GoogleAuthHook {
  /** True when at least one platform Google client id is set — otherwise gate the UI. */
  configured: boolean;
  /** True while the request object is still being prepared. */
  ready: boolean;
  /** Kick off the Google auth-session flow. Resolves with an ID token, or null. */
  promptGoogle: () => Promise<string | null>;
}

/**
 * Worker "Continue with Google" via expo-auth-session's Google provider,
 * env-driven from the per-platform GOOGLE_CLIENT_IDS (AUTH_FLOW §A2). The
 * provider picks the right client id for the running platform (web/iOS/Android).
 * When ALL ids are ABSENT, `configured` is false so the caller renders a disabled
 * button with a "Google sign-in not configured" note (mirrors web-admin) — never
 * crashes.
 *
 * On success it returns the Google ID token, which the caller hands to
 * AuthContext.googleSignIn → POST /api/auth/google {context:"worker"}.
 */
export function useGoogleAuth(): GoogleAuthHook {
  const { web, ios, android, expo } = GOOGLE_CLIENT_IDS;
  const configured = !!(web || ios || android || expo);

  // useIdTokenAuthRequest yields an `id_token` directly (what the backend wants).
  // Pass every configured platform id; the provider selects per platform and
  // `clientId` is the catch-all fallback (web/Expo). When unconfigured we still
  // call the hook (rules of hooks) with a dummy id and simply never prompt.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: web,
    iosClientId: ios,
    androidClientId: android,
    clientId: web ?? expo ?? ios ?? android ?? 'unconfigured',
  });

  const [resolver, setResolver] = useState<
    ((token: string | null) => void) | null
  >(null);

  useEffect(() => {
    if (!resolver || !response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token ?? null;
      resolver(idToken);
    } else if (
      response.type === 'error' ||
      response.type === 'cancel' ||
      response.type === 'dismiss'
    ) {
      resolver(null);
    }
    setResolver(null);
  }, [response, resolver]);

  const promptGoogle = useCallback(async (): Promise<string | null> => {
    if (!configured) return null;
    const result = await promptAsync();
    if (result.type === 'success') {
      return result.params?.id_token ?? null;
    }
    return null;
  }, [configured, promptAsync]);

  return { configured, ready: !!request, promptGoogle };
}
