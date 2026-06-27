// Google SSO (admin + worker) — env-driven, mirrors services/paystack.ts.
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

import { OAuth2Client } from "google-auth-library";

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

const CLIENT_IDS: string[] = collectClientIds();

let client: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  // The OAuth2Client constructor arg is only used as a default audience; we pass
  // the full audience array explicitly to verifyIdToken, so any id works here.
  if (!client) client = new OAuth2Client(CLIENT_IDS[0]);
  return client;
}

export const google = {
  /** True when at least one Google client id is configured. */
  get enabled(): boolean {
    return CLIENT_IDS.length > 0;
  },

  /** The allowed audiences (every configured client id). Exposed for diagnostics. */
  get clientIds(): string[] {
    return CLIENT_IDS;
  },

  /** Verify a Google ID token; returns the verified email + subject (sub) + name. */
  async verifyIdToken(idToken: string): Promise<{ email: string; sub: string; name?: string }> {
    const ticket = await getClient().verifyIdToken({
      idToken,
      // google-auth-library accepts a string[] — the token's aud must match one.
      audience: CLIENT_IDS,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      throw new Error("Google account has no verified email");
    }
    return { email: payload.email.toLowerCase(), sub: payload.sub, name: payload.name };
  },
};
