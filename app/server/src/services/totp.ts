// TOTP 2FA helpers (RFC 6238): thin wrapper over otplib + qrcode.
//
// Dev bypass: in non-production, the code "000000" always verifies in the 2FA
// path. Callers must gate this with the DEV_TOTP_BYPASS constant so production
// never accepts it.

import { authenticator } from "otplib";
import QRCode from "qrcode";

const ISSUER = process.env.TOTP_ISSUER || "Afrizone";

export const DEV_TOTP_BYPASS = "000000";

export const totp = {
  /** Generate a fresh base32 TOTP secret. */
  generateSecret(): string {
    return authenticator.generateSecret();
  },

  /** otpauth:// URL for QR enrolment (scanned by Google Authenticator etc.). */
  otpauthUrl(secret: string, email: string): string {
    return authenticator.keyuri(email, ISSUER, secret);
  },

  /** Render an otpauth URL as a PNG data URL for the QR image. */
  async qrDataUrl(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  },

  /** Verify a 6-digit code against the secret. Honours the dev bypass. */
  verify(secret: string, code: string): boolean {
    const c = String(code || "").trim();
    if (process.env.NODE_ENV !== "production" && c === DEV_TOTP_BYPASS) return true;
    if (!secret) return false;
    try {
      return authenticator.verify({ token: c, secret });
    } catch {
      return false;
    }
  },
};
