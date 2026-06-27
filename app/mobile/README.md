# Afrizone Part Time — Worker Mobile App

The part-timer's end-user app: find tasks, get verified (KYC), clock in/out, and
get paid to a wallet. Built with **Expo (SDK 51) + expo-router + TypeScript +
react-native-svg**. Brand and screens follow `../../DESIGN_SPEC.md`; API per
`../API_CONTRACT.md`.

## Run it

```bash
cd app/mobile
npm install
npx expo start          # then press i (iOS sim) / a (Android emulator) / w (web), or scan the QR with Expo Go
```

Type-check only:

```bash
npx tsc --noEmit
```

## Demo login

- **Worker:** `amaka.obi@afrizone.work` / `worker123`
- Other seeded workers follow `<first>.<last>@afrizone.work` (see `API_CONTRACT.md` seed data).

The login screen is pre-filled with the demo worker.

## Backend

The app talks to the live backend at **`http://localhost:4000/api`** (JWT bearer).
Start `app/server` first — login, the task feed, task detail, and wallet are
**real** calls and will show error/empty states if it's down.

### API base URL (configurable)

`src/api/config.ts` chooses the base URL:

- **iOS simulator / web:** `http://localhost:4000/api`
- **Android emulator:** `http://10.0.2.2:4000/api` (the emulator's alias for the
  host machine's `localhost` — `localhost` from inside the emulator is the
  emulator itself).
- **Physical device (Expo Go):** set your machine's LAN IP, e.g.
  ```bash
  EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api npx expo start
  ```
  (Also settable via `expo.extra.apiUrl` in `app.json`.)

## What's real vs mocked

**Real (wired to `app/server` via `src/api/client.ts`):**
- Login — `POST /api/auth/login`
- Home task feed & "Matched for you" — `GET /api/tasks`
- Task detail — `GET /api/tasks/:id`
- Wallet 3-balance card + Home earnings snapshot — `GET /api/workers/:id` (derived `wallet`)
- Jobs — `GET /api/jobs` (v2; **falls back to mock** if unreachable/404)

**Mocked (`src/api/mock.ts`, local/in-memory — no backend endpoint yet):**
Each is marked with a `TODO(backend)` pointing at the route to build:
- My Tasks list & apply-to-task → `GET /api/applications?workerId=`, `POST /api/applications`
- Clock in/out (+ offline queue) → `POST /api/clock`
- Submit timesheet → `POST /api/timesheets`
- Withdraw → `POST /api/wallet/withdraw`
- Wallet transaction history → `GET /api/workers/:id/transactions`
- Contracts → `GET /api/contracts`, `POST /api/contracts/:id/sign`
- The entire **KYC stepper** is local-state only (phone/OTP/tier/ID/selfie/TIN/bank).

## Notes

- **No backdrop blur:** `Card` uses a solid surface + soft warm shadow instead of
  `expo-blur` to keep the dependency footprint light and stay fast on cheap field
  phones (DESIGN_SPEC §0.2). Swap to `expo-blur` later for brand moments if wanted.
- **Icons** are SVG (Lucide-style, `src/components/Icon.tsx`) — no emoji.
- **Money** is whole-Naira ₦ via `src/lib/format.ts` (`formatNaira`), tabular figures.
- **Tokens/brand** live in `src/theme.ts`, matched to the web admin palette + logo.
- No binary icon/splash assets are bundled; `app.json` brands the splash/adaptive
  icon with brand colors. Add `assets/icon.png` + `assets/splash.png` before a store build.
