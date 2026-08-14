// Smile Identity: Document Verification (job_type 6): OCRs an ID document image,
// checks its authenticity, and compares it against a live selfie for a face match.
//
// Env-driven: with SMILE_PARTNER_ID/SMILE_API_KEY blank, `enabled` is false and the
// KYC flow falls back to pure manual admin review (the pre-existing behaviour).
// With both set, worker submissions also run through an automated verification pass
// whose result feeds (but does not fully replace) the admin decision: a REJECTED
// result short-circuits straight to kycStatus REJECTED with the real reason attached;
// an approved result moves the worker to kycStatus VERIFIED, still awaiting an admin's
// final TIER_APPROVED call via POST /api/workers/:id/kyc.
//
// Docs: https://docs.usesmileid.com/products/for-individuals-kyc/document-verification
// SDK:  https://github.com/smileidentity/smile-identity-core-js

import type { Signature, WebApi } from "smile-identity-core";

// Read lazily, not at module load: Workers only populate process.env from
// bindings once request handling begins, not at pure module-evaluation time -
// reading these eagerly always saw them as unset, permanently forcing manual
// KYC review regardless of what's actually configured. See
// src/services/paystack.ts for the same pattern.
function config() {
  return {
    partnerId: process.env.SMILE_PARTNER_ID || "",
    apiKey: process.env.SMILE_API_KEY || "",
    // '0' = sandbox, '1' = production (see https://docs.usesmileid.com/further-reading/faqs)
    sidServer: process.env.SMILE_SID_SERVER || "0",
    // Optional: required for async human-review updates to reach
    // POST /api/webhooks/smile. Without it, results still come back
    // synchronously via return_job_status (see below).
    callbackUrl: process.env.SMILE_CALLBACK_URL || "",
  };
}

export function isSmileConfigured(): boolean {
  const { partnerId, apiKey } = config();
  return !!(partnerId && apiKey);
}

export const JOB_TYPE_DOCUMENT_VERIFICATION = 6;

// Nigeria document keywords Smile ID recognises for Document Verification.
// https://docs.usesmileid.com/supported-id-types/for-individuals-kyc/using-document-image/regions/africa
export const NG_ID_TYPES = ["IDENTITY_CARD", "PASSPORT", "DRIVERS_LICENSE", "VOTER_ID"] as const;
export type NgIdType = (typeof NG_ID_TYPES)[number];

export interface DocVerificationResult {
  /** True once Smile has returned a final (not further-processing) verdict. */
  final: boolean;
  approved: boolean;
  resultCode?: string;
  resultText?: string;
  smileJobId?: string;
  raw: unknown;
}

let _webApi: WebApi | null = null;
// Dynamically imported (not a static top-level import): smile-identity-core's
// axios/https-proxy-agent dependency chain only supports being loaded when
// actually used, not eagerly at module-eval time - keeps it out of every cold
// start that never touches Smile ID document verification.
async function getWebApi(): Promise<WebApi> {
  if (!_webApi) {
    const { WebApi } = await import("smile-identity-core");
    const { partnerId, callbackUrl, apiKey, sidServer } = config();
    _webApi = new WebApi(partnerId, callbackUrl || null, apiKey, sidServer);
  }
  return _webApi;
}

/** Result codes documented as "Approved" or "Approved with Attention" (still a pass). */
const APPROVED_CODES = new Set(["0810", "0817"]);
export function isApprovedResultCode(resultCode: string | undefined): boolean {
  return !!resultCode && APPROVED_CODES.has(resultCode);
}

/**
 * Submit a Document Verification job (ID front image + selfie, optionally ID back)
 * and wait synchronously for the machine result via `return_job_status`.
 *
 * Note: per Smile's docs, a job that requires human review can still change after
 * this returns: CALLBACK_URL (POST /api/webhooks/smile) is how that final update
 * arrives. Without a public callback URL (e.g. local dev), this synchronous result
 * is the only one you'll get, which is fine for demoing the golden path.
 */
export async function submitDocumentVerification(input: {
  jobId: string;
  userId: string;
  idType: NgIdType;
  idFrontBase64: string;
  selfieBase64: string;
  idBackBase64?: string;
}): Promise<DocVerificationResult> {
  if (!isSmileConfigured()) throw new Error("Smile ID is not configured");

  const images: Array<{ image_type_id: number; image: string }> = [
    { image_type_id: 2, image: input.selfieBase64 }, // SELFIE_IMAGE_BASE64
    { image_type_id: 3, image: input.idFrontBase64 }, // ID_CARD_IMAGE_BASE64
  ];
  if (input.idBackBase64) {
    images.push({ image_type_id: 7, image: input.idBackBase64 }); // ID_CARD_BACK_IMAGE_BASE64
  }

  const api = await getWebApi();
  const response: any = await api.submit_job(
    { job_id: input.jobId, user_id: input.userId, job_type: JOB_TYPE_DOCUMENT_VERIFICATION },
    images,
    { country: "NG", id_type: input.idType },
    { return_job_status: true, return_history: false, return_images: false }
  );

  const result = response?.result ?? response;
  const resultCode: string | undefined = result?.ResultCode;
  const resultText: string | undefined = result?.ResultText;
  const smileJobId: string | undefined = result?.SmileJobID;
  const final = !!response?.job_complete;
  const approved = isApprovedResultCode(resultCode);

  return { final, approved, resultCode, resultText, smileJobId, raw: response };
}

/** Verify the `timestamp`/`signature` pair Smile ID sends on every webhook callback. */
export async function verifyWebhookSignature(timestamp: string, signature: string): Promise<boolean> {
  if (!isSmileConfigured()) return false;
  const { Signature } = await import("smile-identity-core");
  const { partnerId, apiKey } = config();
  return new Signature(partnerId, apiKey).confirm_signature(timestamp, signature);
}
