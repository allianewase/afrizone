// Withholding-tax computation. Money is whole-Naira integers.
// net = round(gross - gross * whtRate). Default WHT rate 5% (0.05).

export interface WhtResult {
  whtAmount: number;
  net: number;
}

export function computeWht(gross: number, rate = 0.05): WhtResult {
  const whtAmount = Math.round(gross * rate);
  const net = Math.round(gross - gross * rate);
  return { whtAmount, net };
}
