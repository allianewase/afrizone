# Smile ID Setup (Afrizone Part Time)

This wires automated KYC — **Document Verification** (ID document + selfie,
biometric face match, document authenticity check) — into the worker onboarding
flow, on top of the existing manual admin review.

Everything is env-gated: with no partner id / API key, KYC works exactly as it
always has (workers upload photos, an admin manually reviews and approves the
tier). With both set, submissions also run through Smile ID automatically:

- A **rejected** result moves the worker straight to `kycStatus: REJECTED`,
  with the real reason from Smile shown in the app (no more generic message).
- An **approved** result moves the worker to `kycStatus: VERIFIED` — identity
  confirmed, but an admin still makes the final `TIER_APPROVED` call via the
  existing **Workers → KYC** review flow in web-admin. Nothing here removes
  the human in the loop.

---

## 1. Create a Smile ID account

1. Go to <https://portal.usesmileid.com/> and sign up (or log in).
2. Your **Partner ID** is shown in the left-hand menu of the dashboard.
3. Under **Developer → API Key**, click **Generate New API Key** and copy it —
   make sure you're in the environment (Sandbox vs Live) you intend to use.

Sandbox is free and requires no approval — it's what you want for local dev
and demoing. Live requires completing Smile's own KYC on your business before
it processes real documents.

## 2. Configure the backend

Edit `server/.env`:

```
SMILE_PARTNER_ID=<your partner id>
SMILE_API_KEY=<your sandbox or live api key>
SMILE_SID_SERVER=0        # 0 = sandbox, 1 = production
```

Restart the server after changing `.env`.

That's it for local testing — `POST /api/me/kyc/submit` will call Smile ID
synchronously (`return_job_status: true`) and get a machine result back
immediately, no public URL required.

## 3. (Optional) Callback URL for human-review updates

Some jobs Smile can't decide automatically get routed to a human reviewer,
and the *first* result you get back synchronously may not be final. The final
decision only ever arrives via a callback POST to your server. To receive it:

```
SMILE_CALLBACK_URL=https://<your-public-url>/api/webhooks/smile
```

Locally this means tunnelling your dev server (e.g. `ngrok http 4000`) and
setting `SMILE_CALLBACK_URL` to the tunnel URL + `/api/webhooks/smile`. In
production, point it at your real domain. Without this set, you'll still get
the synchronous machine result — fine for demoing the golden path, just not
authoritative for jobs that need review.

## 4. Test

- **Sandbox behaviour** (documented by Smile): the selfie is compared to the
  photo on the ID — if they don't visually match, the job is rejected; the
  document's authenticity is never actually checked in sandbox (always
  "valid"); and `id_type`/`country` aren't validated against real support
  lists. So in sandbox, upload the *same face* for both the ID photo and the
  selfie step to get an approval, and a mismatched face to see a rejection.
- Check `GET /api/health/config` → `services.smileIdentity.ok` should be
  `true` once configured.
- Complete the mobile KYC stepper (ID document → pick an ID type → selfie →
  … → submit). A worker should land on `VERIFIED` or `REJECTED` immediately
  instead of sitting on `PENDING` for manual review.
- On rejection, the app should show the actual reason from Smile (e.g.
  "Selfie did not match the photo on document") rather than a generic notice.

## 5. Supported Nigerian ID types

Document Verification (`job_type: 6`) recognises these `id_type` keywords for
Nigeria (see [supported documents](https://docs.usesmileid.com/supported-id-types/for-individuals-kyc/using-document-image/regions/africa)):
`IDENTITY_CARD` (National ID), `PASSPORT`, `DRIVERS_LICENSE`, `VOTER_ID` — these
are the four exposed in the mobile ID-type picker (`src/services/smileIdentity.ts` → `NG_ID_TYPES`).
