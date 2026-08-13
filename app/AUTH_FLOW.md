# Afrizone Part Time: Authentication & Onboarding Flow (design + contract)

Covers both surfaces. **Workers** (mobile) = passwordless **phone + OTP**. **Admins** (web) = **email/password + mandatory TOTP 2FA + Google SSO**. External providers (SMS, Google) are **env-driven**: real path when keys are set, dev/sim fallback otherwise.

Backend base `http://localhost:4000/api`. JWT bearer as today. All amounts/ids unchanged.

---

## A. Worker flow (mobile): passwordless phone OTP

### Screens & states
1. **Splash** → Get started / I already have an account.
2. **Enter phone**: country prefix (default +234), phone input, Continue. Validation: NG number shape. Legal: "By continuing you agree to Terms & Privacy."
3. **OTP**: 6-digit code, 60s resend timer, auto-advance, paste support. States: idle, verifying, error (wrong/expired), locked (too many attempts). In **dev/sim mode the screen shows the code** (returned as `devCode`) and accepts master `123456`.
4. **Branch on verify:**
   - **New user** (`isNewUser: true`) → **Onboarding/KYC stepper** (B).
   - **Returning** → tabs (Home).
5. **Returning sign-in** = same phone → OTP (no password). Optional device biometric to skip OTP is a later enhancement (not this round).

### Onboarding / KYC stepper (B): 8 steps, ProgressRail, escape route on each
`Name & email → Tier select → ID upload (NIN/BVN/passport) → Selfie liveness → Tier docs (matric / licence+vehicle / certification) → TIN → Bank account → Review & submit`
- Uploads are **captured but stored as mock refs** this round (no real file storage / liveness SDK yet): clearly labelled.
- Submit → `POST /api/me/kyc/submit` → `kycStatus = PENDING`. Worker lands on Home with a **"Verification in review"** banner; **applying to tasks is blocked until `TIER_APPROVED`** (admin verifies, existing flow). "Verify later" allowed for non-blocking steps.

### Worker endpoints
- `POST /api/auth/otp/request` → body `{ phone }` → `{ sent: true, devCode?: string }` (`devCode` only in sim/dev). Creates a hashed OtpCode (purpose `login`), 10-min expiry, rate-limited (≤5/hour/phone). Sends SMS when configured.
- `POST /api/auth/otp/verify` → body `{ phone, code }` → `{ token, user, isNewUser }`. Wrong/expired → `400 {error}`; ≥5 attempts → `429`. If no user has this phone, **create a WORKER** (`kycStatus PENDING`, name null/“New worker”, passwordless) and set `isNewUser true`.
- Dev/sim: master code **`123456`** works when `NODE_ENV !== "production"`.

---

## B. Admin flow (web): password + TOTP 2FA + Google SSO

### Screens & states
1. **Login**: email, password, "Sign in"; **"Sign in with Google"** button; "Forgot password?". Invite-only (no public signup). States: idle, submitting, error.
2. **2FA challenge** (when the account has 2FA enabled): 6-digit TOTP, "Use a recovery code" link (recovery optional this round). States: verifying, error, dev-bypass.
3. **Forgot password** → enter email → "If it exists, we sent a link." → **Reset password** screen (token from email/dev) → set new password → back to login.
4. **Security settings** (in admin Settings): **Enable 2FA**: shows QR (otpauth) + secret, user scans in Authenticator, enters a code to confirm → enabled. Disable 2FA (requires a current code).

### Admin endpoints
- `POST /api/auth/login` → `{ email, password }` →
  - no 2FA: `{ token, user }`
  - 2FA on: `{ requires2fa: true, challenge }` (a short-lived ~5-min 2FA JWT; **no full token yet**).
- `POST /api/auth/2fa/verify` → `{ challenge, code }` → `{ token, user }`. Dev bypass: `000000` when `NODE_ENV !== "production"`.
- `POST /api/auth/2fa/setup` (auth) → `{ otpauthUrl, qrDataUrl, secret }` (stores a *pending* secret; not yet enabled).
- `POST /api/auth/2fa/enable` (auth) → `{ code }` → `{ enabled: true }` (verifies pending secret, sets `totpEnabled`).
- `POST /api/auth/2fa/disable` (auth) → `{ code }` → `{ enabled: false }`.
- `POST /api/auth/google` → `{ idToken }` → verify with `google-auth-library` against `GOOGLE_CLIENT_ID`; match an **existing** admin by verified email (invite-only: do NOT auto-create) → `{ token, user }`. Returns `400` if email not a known admin, or `503 {error:"Google SSO not configured"}` when `GOOGLE_CLIENT_ID` unset.
- `POST /api/auth/password/forgot` → `{ email }` → always `{ sent: true, devToken? }` (no account enumeration; `devToken` only in sim/dev). Creates a hashed PasswordReset, 30-min expiry.
- `POST /api/auth/password/reset` → `{ token, password }` → `{ ok: true }` (validates token, updates passwordHash, invalidates token).

---

## C. Data model additions (Prisma)
- **User**: add `phone String? @unique`, `passwordHash String?` (now nullable: workers are passwordless), `totpSecret String?` (pending or active), `totpEnabled Boolean @default(false)`, `googleId String? @unique`.
- **OtpCode**: `id, phone, codeHash, purpose, attempts Int @default(0), expiresAt, consumedAt DateTime?, createdAt`.
- **PasswordReset**: `id, userId, tokenHash, expiresAt, usedAt DateTime?, createdAt`.

## D. Env (server/.env)
```
# SMS (worker OTP): blank = sim mode (devCode returned, master 123456 in dev)
SMS_PROVIDER=          # termii | twilio | (blank)
TERMII_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
# Google SSO (admin): blank = SSO button disabled with a clear message
GOOGLE_CLIENT_ID=
# Email (password reset / OTP email): blank = devToken returned, link logged
SMTP_URL=
```

## E. Seed
- Give every worker a unique **phone** (Amaka `+2348030000001`, …) so OTP login works immediately.
- Keep `admin@afrizone.work` / `afrizone123`; **2FA off by default** (frictionless demo): enrollable via Security settings; dev bypass `000000` for the 2FA step.
- Keep worker password `worker123` for backward-compat, but the mobile app uses phone OTP.

## A2. Worker flow (mobile): also supports email/password + Google + 2FA + reset

Workers get **all three** sign-in options (phone OTP stays). New email/Google users are **auto-created as WORKERs → KYC** (self-serve). Admin Google stays invite-only.

### Mobile sign-in screen
`Continue with phone (OTP)` · `Continue with Google` ·: or: `email + password` (+ `Sign up`, `Forgot password?`). If login returns `requires2fa`, show the 2FA challenge screen (same as admin; dev bypass `000000`). After auth: new/never-completed → KYC stepper; else tabs.

### New / changed backend endpoints
- `POST /api/auth/register` → `{ name, email, password }` → creates a **WORKER** (`kycStatus PENDING`, `passwordHash` set) → `{ token, user, isNewUser: true }`. `name` required (≥2 chars), valid email, password ≥8. `409` if email already exists.
- `PATCH /api/me` (auth) → `{ name?, email? }` → updates the authed user's profile and returns the `GET /api/me` shape. Email must stay unique (`409` on clash), valid format (`400`). Used to **persist the name + email collected during onboarding** for phone-OTP / Google signups (which start with placeholders), and for later profile edits.
- `POST /api/auth/login` (existing): already works for workers with a `passwordHash`; the 2FA branch applies to workers too if they enable it.
- `POST /api/auth/google`: now accepts optional `{ idToken, context?: "admin" | "worker" }` (default `"admin"`).
  - `context: "admin"` → invite-only (existing behaviour: match an existing admin, else `400`).
  - `context: "worker"` → match by verified email/`googleId`; if unknown, **auto-create a WORKER** (`kycStatus PENDING`, link `googleId`). Returns `{ token, user, isNewUser }`.
  - `503` when `GOOGLE_CLIENT_ID` unset (both contexts).
- Password reset (`/password/forgot|reset`) and 2FA (`/2fa/*`) are user-agnostic: reused as-is for workers.

### Mobile screens to add
- Email/password **login** (with 2FA challenge branch) and **Sign up** (email + password ≥8 → register → KYC).
- **Forgot password** (email → neutral confirmation, dev token) and **Reset password** (token + new password).
- **Google** button via `expo-auth-session` Google provider, env-driven (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`); when absent, render disabled with "Google sign-in not configured" (mirror admin). Sends the Google ID token to `POST /api/auth/google` with `context: "worker"`.
- **Profile → Security**: enable/disable 2FA (reuse `/2fa/setup|enable|disable`; show the otpauth secret/QR: a `qrDataUrl` image works in RN `<Image>`).

## F. Security notes (carried from blueprint §9)
OTP + reset tokens are **hashed at rest**, single-use, time-boxed, attempt-limited. 2FA secrets are TOTP (RFC 6238). No account enumeration on forgot-password. JWT unchanged (7-day). Rate-limit auth endpoints. No card/PII beyond what KYC requires; provider SDKs (real liveness, SMS, Google) swap in behind these same endpoints.
