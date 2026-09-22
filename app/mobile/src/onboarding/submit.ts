import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import type { OnboardingState } from './OnboardingContext';

export type SubmitOutcome = {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  note: string | null;
};

/**
 * POST /api/me/kyc/submit, shared by every account type's final onboarding
 * step (selfie.tsx for Individual, courier-setup.tsx for Courier,
 * store-details.tsx for Store) - one call site instead of three copies of
 * the same request + user-cache update, mirroring app/(auth)/kyc.tsx's own
 * submit(). Bank/TIN are deliberately not collected during onboarding (both
 * are optional here, same as on the server) - added later from Profile.
 */
export async function submitOnboarding(
  state: OnboardingState,
  updateUser: (patch: Partial<User>) => Promise<void>,
): Promise<SubmitOutcome> {
  const result = await api.submitKyc({
    tier: state.tier ?? undefined,
    idType: state.idType ?? undefined,
  });
  await updateUser({
    kycStatus: result.kycStatus,
    kycNote: result.kycNote ?? null,
    tiers: state.tier ? [state.tier] : [],
  });
  const status = result.kycStatus === 'REJECTED' || result.kycStatus === 'VERIFIED' ? result.kycStatus : 'PENDING';
  return { status, note: result.kycNote ?? null };
}

export { ApiError };
