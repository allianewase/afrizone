# Google Sign-In Setup (Afrizone Part Time)

This wires "Sign in with Google" for **all three** surfaces from one Google
Cloud project:

- **web-admin** (browser, Google Identity Services): admin login (invite-only).
- **mobile** (Expo / iOS / Android, `expo-auth-session`): worker self-serve.
- **backend** (`POST /api/auth/google`): verifies the ID token. It must list
  **every** client id below as an allowed audience, because each app's token
  carries a different `aud`.

Everything is env-gated: with no client ids, the buttons render disabled and the
backend returns `503 {"error":"Google SSO not configured"}`. Nothing breaks.

---

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> → project picker → **New Project**
   (e.g. `afrizone-part-time`). Select it.
2. (No APIs need enabling for Sign-In; the ID token is verified by signature.)

## 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External**. Fill app name (`Afrizone Part Time`), support email,
   developer email. Save.
3. Scopes: the defaults (`openid`, `email`, `profile`) are enough: no extra
   scopes needed. Save.
4. While in **Testing**, add each tester's Google email under **Test users**
   (admins + any worker testers). Publish when ready for the public.

## 3. Create the OAuth Client IDs

**APIs & Services → Credentials → Create credentials → OAuth client ID.** Create
the following (one per app/platform):

### a) Web application  → used by **web-admin AND the backend audience**
- Application type: **Web application**. Name: `afrizone-web`.
- **Authorized JavaScript origins**:
  - `http://localhost:5173` (Vite dev)
  - your production admin origin, e.g. `https://admin.afrizone.work`
- **Authorized redirect URIs**: GIS (One Tap / button) does not require one for
  the popup flow; add your origins above if you later use the redirect flow.
- Copy the **Client ID** → this is the **WEB** client id.

### b) iOS  → used by **mobile on iOS**
- Application type: **iOS**. Name: `afrizone-ios`.
- **Bundle ID**: `work.afrizone.parttime` (matches `app.json` `ios.bundleIdentifier`).
- Copy the **Client ID** → **IOS** client id.

### c) Android  → used by **mobile on Android**
- Application type: **Android**. Name: `afrizone-android`.
- **Package name**: `work.afrizone.parttime` (matches `app.json` `android.package`).
- **SHA-1 certificate fingerprint**: from your signing keystore. For Expo dev
  builds use the debug keystore SHA-1; for EAS builds use
  `eas credentials` → Android → the keystore's SHA-1.
- Copy the **Client ID** → **ANDROID** client id.

### d) Web/Expo client  → used by **mobile via Expo Go / web (`expo-auth-session`)**
- `expo-auth-session`'s Google provider uses a **Web** OAuth client for the
  Expo Go proxy and for running the app on web. Create a second **Web
  application** client named `afrizone-expo` (or reuse the `afrizone-web` one).
- **Authorized redirect URIs**: add the ones `expo-auth-session` uses:
  - Expo Go proxy: `https://auth.expo.io/@<your-expo-username>/afrizone-part-time`
  - Local web dev: `http://localhost:19006` (and/or `http://localhost:8081`)
  - Native deep link (custom scheme, from `app.json` `scheme`): `afrizone://`
  - Standalone redirect (also derived from the scheme): `afrizone:/oauthredirect`
- Copy the **Client ID** → **EXPO** client id.

> The Expo redirect **scheme** is `afrizone` (see `mobile/app.json` → `expo.scheme`).
> `expo-auth-session` builds the redirect URI from this scheme automatically;
> just make sure the URIs above are registered on the matching OAuth client.

---

## 4. Where each Client ID goes

| Client ID (from step 3) | Backend (`server/.env`)     | web-admin (`web-admin/.env`)   | mobile env (`mobile/.env`)            | mobile `app.json` (`expo.extra`) |
| ----------------------- | --------------------------- | ------------------------------ | ------------------------------------- | -------------------------------- |
| **Web** (3a)            | `GOOGLE_WEB_CLIENT_ID`      | `VITE_GOOGLE_CLIENT_ID`        | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`    | `googleWebClientId`              |
| **iOS** (3b)            | `GOOGLE_IOS_CLIENT_ID`      |:                              | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`    | `googleIosClientId`              |
| **Android** (3c)        | `GOOGLE_ANDROID_CLIENT_ID`  |:                              | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`| `googleAndroidClientId`          |
| **Expo/Web** (3d)       | `GOOGLE_EXPO_CLIENT_ID`     |:                              | `EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID`   | `googleExpoClientId`             |

Notes:
- **Backend must list every client id** that any app uses as an allowed audience.
  It collects all of `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`,
  `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_EXPO_CLIENT_ID` (plus the legacy
  `GOOGLE_CLIENT_ID` alias and an optional comma-separated `GOOGLE_CLIENT_IDS`)
  and passes them all as the verification audience.
- `GOOGLE_CLIENT_ID` (backend) and `EXPO_PUBLIC_GOOGLE_CLIENT_ID` /
  `extra.googleClientId` (mobile) still work as the **web** client id alias for
  back-compat.
- web-admin reads only `VITE_GOOGLE_CLIENT_ID` (its own browser web client id):
  unchanged.
- mobile reads env vars first, then falls back to `app.json` → `expo.extra`, so
  you can configure it either way (env preferred for secrets/CI).

---

## 5. Configure each app

**Backend**: edit `server/.env`:
```
GOOGLE_WEB_CLIENT_ID=<web client id>
GOOGLE_IOS_CLIENT_ID=<ios client id>
GOOGLE_ANDROID_CLIENT_ID=<android client id>
GOOGLE_EXPO_CLIENT_ID=<expo/web client id>
```

**web-admin**: create/edit `web-admin/.env`:
```
VITE_GOOGLE_CLIENT_ID=<web client id>
```

**mobile**: either set env vars (preferred):
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<android client id>
EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=<expo/web client id>
```
…or fill `mobile/app.json` → `expo.extra`:
```json
"extra": {
  "googleWebClientId": "<web client id>",
  "googleIosClientId": "<ios client id>",
  "googleAndroidClientId": "<android client id>",
  "googleExpoClientId": "<expo/web client id>"
}
```

Restart each dev process after changing env/`app.json` so values are picked up.

---

## 6. Test

- **Admin (web-admin)**: run the admin app, open **Login** → the "Sign in with
  Google" button should be **enabled** (it's disabled when
  `VITE_GOOGLE_CLIENT_ID` is unset). Sign in with a Google account that already
  matches an **admin** user → you get a session. A non-admin email returns
  `400 No admin account for this Google email` (invite-only, no auto-create).
- **Worker (mobile)**: run the mobile app, open the sign-in screen → "Continue
  with Google" should be **enabled** (disabled with "Google sign-in not
  configured" when no ids are set). Completing the flow auto-creates a WORKER
  (KYC `PENDING`) on first sign-in and lands you in onboarding.
- **Backend**: with no ids set, `POST /api/auth/google` returns
  `503 {"error":"Google SSO not configured"}`. With ids set, an invalid/foreign
  token returns `400 {"error":"Invalid Google token"}`.

If mobile sign-in fails with an audience/`aud` mismatch, confirm the failing
platform's client id is **also** present in `server/.env` (the backend rejects
tokens whose `aud` isn't in its allowed-audience list).
