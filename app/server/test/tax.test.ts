import { describe, it, expect } from "vitest";
import { computeWht } from "../src/util/tax";

describe("withholding tax", () => {
  // The invariant that matters for the ledger: what the worker receives plus
  // what was withheld must equal what the task cost. Rounding whtAmount and net
  // independently broke this for 5% of all amounts - every gross where
  // gross * rate landed exactly on .5, both halves rounded up and the sum came
  // to gross + 1.
  it("always reconciles: whtAmount + net === gross", () => {
    const offenders: number[] = [];
    for (let gross = 1; gross <= 100000; gross++) {
      const { whtAmount, net } = computeWht(gross);
      if (whtAmount + net !== gross) offenders.push(gross);
    }
    expect(offenders).toEqual([]);
  });

  it("reconciles at the amounts that used to overpay", () => {
    // gross ≡ 10 (mod 20) put gross * 0.05 exactly on .5.
    for (const gross of [10, 30, 50, 70, 90, 110]) {
      const { whtAmount, net } = computeWht(gross);
      expect(whtAmount + net).toBe(gross);
    }
  });

  it("withholds 5% by default, rounded to whole naira", () => {
    expect(computeWht(20000)).toEqual({ whtAmount: 1000, net: 19000 });
    expect(computeWht(9000)).toEqual({ whtAmount: 450, net: 8550 });
  });

  it("reconciles for non-default rates too", () => {
    for (const rate of [0, 0.025, 0.075, 0.1, 0.333]) {
      for (const gross of [1, 7, 10, 333, 12345]) {
        const { whtAmount, net } = computeWht(gross, rate);
        expect(whtAmount + net).toBe(gross);
      }
    }
  });

  it("never pays out more than the gross", () => {
    for (let gross = 1; gross <= 5000; gross++) {
      expect(computeWht(gross).net).toBeLessThanOrEqual(gross);
    }
  });
});
