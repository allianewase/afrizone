import type { Tier } from '../api/types';

/**
 * Nigeria document keywords Smile ID's Document Verification recognises
 * (server/src/services/smileIdentity.ts -> NG_ID_TYPES). Only used when Smile
 * ID is configured server-side; harmless to always collect otherwise.
 *
 * Shared by the first-time onboarding flow (app/(auth)/id-upload.tsx) and the
 * standalone re-verification wizard (app/(auth)/kyc.tsx) - one list, not two
 * that can drift.
 */
export const ID_TYPES: { key: string; label: string }[] = [
  { key: 'IDENTITY_CARD', label: 'National ID' },
  { key: 'VOTER_ID', label: "Voter's Card" },
  { key: 'DRIVERS_LICENSE', label: "Driver's Licence" },
  { key: 'PASSPORT', label: 'Passport' },
];

export const TIERS: { key: Tier; blurb: string; docLabel: string }[] = [
  { key: 'STUDENT', blurb: 'Campus tasks, surveys, promo.', docLabel: 'Matric number / student ID' },
  { key: 'DISPATCH', blurb: 'Parcel runs & delivery.', docLabel: "Driver's licence + vehicle papers" },
  { key: 'REMOTE', blurb: 'Online data, support, freelance.', docLabel: 'Portfolio / CV (optional)' },
  { key: 'PROMO', blurb: 'Activations & field marketing.', docLabel: 'Reference / past activation' },
  { key: 'TRADE', blurb: 'Skilled trades.', docLabel: 'Trade certification' },
];
