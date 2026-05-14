// test/analytics/pmcc.test.ts
import { describe, it, expect } from "vitest";
import { pmccEvaluator } from "../../src/analytics/pmcc.js";

describe("pmccEvaluator", () => {
  it("computes net debit, breakeven, and combined Greeks", () => {
    const result = pmccEvaluator({
      longLeg:  { strike: 100, T: 1.5, sigma: 0.25, entryDebit: 35, mark: 38 },
      shortLeg: { strike: 130, T: 30 / 365, sigma: 0.30, entryCredit: 2, mark: 1.5 },
      S: 125,
    });
    expect(result.netDebit).toBeCloseTo(33, 4);             // 35 - 2
    expect(result.currentValue).toBeCloseTo(36.5, 4);       // 38 - 1.5
    expect(result.pnlPerShare).toBeCloseTo(3.5, 4);
    expect(result.breakevenAtLongExpiry).toBeCloseTo(133, 4); // 100 + 33
    expect(result.combinedGreeks.delta).toBeDefined();
    expect(result.costBasisViolation).toBe(false);
  });
  it("flags cost-basis violation when short strike <= long strike + entry debit", () => {
    const result = pmccEvaluator({
      longLeg:  { strike: 100, T: 1, sigma: 0.25, entryDebit: 35, mark: 35 },
      shortLeg: { strike: 130, T: 30 / 365, sigma: 0.30, entryCredit: 2, mark: 2 },
      S: 120,
    });
    expect(result.costBasisViolation).toBe(true); // 130 <= 100 + 35
  });
});
