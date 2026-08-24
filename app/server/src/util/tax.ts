// Withholding-tax computation. Money is whole-Naira integers.
// net = round(gross - gross * whtRate). Default WHT rate 5% (0.05).

export interface WhtResult {
  whtAmount: number;
  net: number;
}

export function computeWht(gross: number, rate = 0.05): WhtResult {
  // net is DERIVED from whtAmount, never rounded independently.
  //
  // Rounding both separately broke reconciliation for 5% of all amounts:
  // whenever gross * rate landed exactly on .5, both halves rounded up and
  // whtAmount + net came to gross + 1. At gross 10 that paid the worker the
  // full 10 while also booking 1 as withheld - the platform funded the tax and
  // the ledger could never balance.
  //
  // Subtraction makes the invariant whtAmount + net === gross hold by
  // construction, for every gross and every rate.
  const whtAmount = Math.round(gross * rate);
  const net = gross - whtAmount;
  return { whtAmount, net };
}
