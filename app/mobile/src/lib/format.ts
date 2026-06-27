/** Whole-Naira integer formatting. Amounts are NEVER kobo (API_CONTRACT.md). */
export function formatNaira(amount: number | null | undefined): string {
  const n = Math.round(Number(amount ?? 0));
  return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

/** Naira sign as a standalone glyph. */
export const NAIRA = '₦';

/** "₦2,500/hr" or "₦18,000 fixed" depending on pay model. */
export function payLabel(
  payModel: 'HOURLY' | 'FIXED',
  rate?: number | null,
  budget?: number | null
): string {
  if (payModel === 'HOURLY') return `${formatNaira(rate)}/hr`;
  return `${formatNaira(budget ?? rate)} fixed`;
}

/** net = gross − WHT (round). Mirrors API_CONTRACT money math. */
export function netFromGross(gross: number, whtRate = 0.05): number {
  return Math.round(gross - gross * whtRate);
}

/** Friendly relative-ish date for deadlines. */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

/**
 * Build an E.164 phone from a country prefix (e.g. "+234") and a locally typed
 * national number. Strips a leading 0 (common NG entry) and all non-digits.
 * e.g. ("+234", "0803 000 0001") → "+2348030000001".
 */
export function toE164(prefix: string, local: string): string {
  const cc = prefix.replace(/[^\d]/g, '');
  let nat = local.replace(/\D/g, '');
  if (nat.startsWith('0')) nat = nat.replace(/^0+/, '');
  return `+${cc}${nat}`;
}

/** Loose NG validity check: 10 national digits after stripping a leading 0. */
export function isValidNgNumber(local: string): boolean {
  let nat = local.replace(/\D/g, '');
  if (nat.startsWith('0')) nat = nat.replace(/^0+/, '');
  return nat.length === 10;
}

/** mm:ss / h:mm:ss elapsed timer formatting. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}
