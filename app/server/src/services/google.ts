// Google SSO (admin + worker): env-driven, mirrors services/paystack.ts.
//
// Supports MULTIPLE allowed audiences so a single backend can verify tokens
// from every Google OAuth client across our apps:
//   - web-admin (browser GIS)      -> aud = web client id
//   - mobile (Expo / iOS / Android) -> aud = ios / android / expo client id
//
// Client ids are collected (non-empty) from any of:
//   GOOGLE_CLIENT_ID         (back-compat alias, treated as the web client id)
//   GOOGLE_WEB_CLIENT_ID
//   GOOGLE_IOS_CLIENT_ID
//   GOOGLE_ANDROID_CLIENT_ID
//   GOOGLE_EXPO_CLIENT_ID
//   GOOGLE_CLIENT_IDS        (comma-separated extra ids)
//
// With NO ids configured, `enabled` is false and POST /api/auth/google returns
// 503. Invite-only (admin): a verified Google email must already match a known
// admin user; workers self-serve (see routes/authAdmin.ts).

import type { OAuth2Client } from "google-auth-library";

// Read lazily, not at module load: Workers only populate process.env from
// bindings once request handling begins, not at pure module-evaluation time -
// reading these eagerly always saw them as unset, permanently disabling
// Google SSO regardless of what's actually configured. See
// src/services/paystack.ts for the same pattern.
/** Collect every configured Google client id (deduped, non-empty). */
function collectClientIds(): string[] {
  const single = [
    process.env.GOOGLE_CLIENT_ID, // back-compat: treated as the web client id
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_EXPO_CLIENT_ID,
  ];
  const csv = (process.env.GOOGLE_CLIENT_IDS || "").split(",");
  const all = [...single, ...csv]
    .map((v) => (v || "").trim())
    .filter((v) => v.length > 0);
  return Array.from(new Set(all));
}

let client: OAuth2Client | null = null;
// Dynamically imported (not a static top-level import): google-auth-library
// pulls in a gaxios/gcp-metadata/google-logging-utils dependency chain that
// only supports being loaded when actually used, not eagerly at module-eval
// time - keeps it out of every cold start that never touches Google SSO.
async function getClient(clientIds: string[]): Promise<OAuth2Client> {
  if (!client) {
    const { OAuth2Client } = await import("google-auth-library");
    // The OAuth2Client constructor arg is only used as a default audience; we
    // pass the full audience array explicitly to verifyIdToken, so any id works here.
    client = new OAuth2Client(clientIds[0]);
  }
  return client;
}

export const google = {
  /** True when at least one Google client id is configured. */
  get enabled(): boolean {
    return collectClientIds().length > 0;
  },

  /** The allowed audiences (every configured client id). Exposed for diagnostics. */
  get clientIds(): string[] {
    return collectClientIds();
  },

  /** Verify a Google ID token; returns the verified email + subject (sub) + name. */
  async verifyIdToken(idToken: string): Promise<{ email: string; sub: string; name?: string }> {
    const clientIds = collectClientIds();
    const oauthClient = await getClient(clientIds);
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      // google-auth-library accepts a string[]: the token's aud must match one.
      audience: clientIds,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      throw new Error("Google account has no verified email");
    }
    return { email: payload.email.toLowerCase(), sub: payload.sub, name: payload.name };
  },
};
