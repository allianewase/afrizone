import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AccountType, Tier } from '../api/types';

/**
 * State carried across the first-time onboarding screens (app/(auth)/phone.tsx
 * through .../verified.tsx). expo-router screens are separate routes, not
 * steps of one component, so this is the one place that state lives instead
 * of being re-threaded through every screen's route params.
 *
 * In-memory only, scoped to the (auth) navigator (see (auth)/_layout.tsx) -
 * it does not need to survive an app restart any more than the old kyc.tsx
 * stepper's local state did.
 */
export interface OnboardingState {
  accountType: AccountType;
  name: string;
  email: string;
  tier: Tier | null;
  idType: string | null;
  idDocId: string | null;
  selfieDocId: string | null;
  /** Tier-specific supporting document (student ID, trade cert, etc). */
  docsDocId: string | null;
  /** AZM Store only. See app/(auth)/store-details.tsx for why this is never
   *  submitted anywhere yet - there is no organization to submit it against
   *  until Afrizone staff create one. */
  storeDetails: { businessName: string; cacNumber: string; tin: string; address: string };
}

const DEFAULT_STATE: OnboardingState = {
  accountType: 'INDIVIDUAL',
  name: '',
  email: '',
  tier: null,
  idType: null,
  idDocId: null,
  selfieDocId: null,
  docsDocId: null,
  storeDetails: { businessName: '', cacNumber: '', tin: '', address: '' },
};

interface OnboardingContextValue {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);
  const value = useMemo(() => ({ state, update }), [state, update]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
