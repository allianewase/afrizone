/**
 * ============================================================================
 *  MOCK FALLBACK — only what still has NO worker-facing endpoint.
 * ============================================================================
 *
 * All worker actions (applications, clock, timesheets, wallet, withdrawals,
 * contracts, KYC, profile) are now wired to REAL API v3 endpoints in
 * src/api/client.ts. The only thing left here is a jobs fallback: the v2
 * `GET /api/jobs` endpoint may not be enabled in every backend, so jobs.tsx
 * falls back to these sample rows when the live call fails.
 */

import type { Job } from './types';

function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const mock = {
  /**
   * Jobs fallback (used only if GET /api/jobs is unreachable / 404).
   * Real path: GET /api/jobs (v2 contract).
   */
  jobs(): Promise<Job[]> {
    return delay([
      {
        id: 'job-1',
        title: 'Operations Associate',
        department: 'Logistics',
        location: 'Lagos',
        employmentType: 'FULL_TIME',
        salaryMin: 250000,
        salaryMax: 400000,
        description: 'Coordinate field operations and dispatch teams.',
        needsCv: true,
        status: 'OPEN',
        candidateCount: 4,
      },
      {
        id: 'job-2',
        title: 'Field Marketing Lead',
        department: 'Marketing',
        location: 'Lagos',
        employmentType: 'FULL_TIME',
        salaryMin: 350000,
        salaryMax: 500000,
        description: 'Lead activations and promotional campaigns.',
        needsCv: true,
        needsPortfolio: true,
        status: 'OPEN',
        candidateCount: 2,
      },
      {
        id: 'job-3',
        title: 'Customer Support (Remote)',
        department: 'Support',
        location: 'Remote',
        employmentType: 'PART_TIME',
        salaryMin: 120000,
        salaryMax: 180000,
        description: 'Handle worker and client support tickets.',
        needsCv: true,
        status: 'OPEN',
        candidateCount: 2,
      },
    ]);
  },
};
