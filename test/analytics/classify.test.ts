// test/analytics/classify.test.ts
import { describe, it, expect } from "vitest";
import { classifyPositionsByStrategy, type Position } from "../../src/analytics/classify.js";

const NOW = new Date("2025-06-01");

const stk = (symbol: string, qty: number): Position => ({
  symbol,
  secType: "STK",
  quantity: qty,
});
const opt = (
  symbol: string,
  right: "C" | "P",
  strike: number,
  expiry: string,
  qty: number,
): Position => ({ symbol, secType: "OPT", right, strike, expiry, quantity: qty });

describe("classifyPositionsByStrategy", () => {
  it("identifies a covered call (long 100 stock + short ATM call)", () => {
    const out = classifyPositionsByStrategy(
      [stk("AAPL", 100), opt("AAPL", "C", 180, "2026-06-19", -1)],
      NOW,
    );
    expect(out.find((g) => g.strategy === "covered-call")).toBeDefined();
  });
  it("identifies a PMCC pair (long deep ITM LEAPS call + short OTM call same underlying)", () => {
    const out = classifyPositionsByStrategy(
      [
        opt("AAPL", "C", 120, "2027-06-18", 1),
        opt("AAPL", "C", 180, "2026-06-19", -1),
      ],
      NOW,
    );
    expect(out.find((g) => g.strategy === "pmcc")).toBeDefined();
  });
  it("identifies a standalone LEAPS (long call > 365 DTE without short)", () => {
    const out = classifyPositionsByStrategy([opt("AAPL", "C", 120, "2027-06-18", 1)], NOW);
    expect(out.find((g) => g.strategy === "leaps")).toBeDefined();
  });
  it("identifies a cash-secured put (short put, no offsetting long)", () => {
    const out = classifyPositionsByStrategy([opt("AAPL", "P", 170, "2026-06-19", -1)], NOW);
    expect(out.find((g) => g.strategy === "csp")).toBeDefined();
  });
  it("identifies a bull put credit spread", () => {
    const out = classifyPositionsByStrategy(
      [
        opt("SPY", "P", 450, "2026-06-19", -1),
        opt("SPY", "P", 445, "2026-06-19", +1),
      ],
      NOW,
    );
    expect(out.find((g) => g.strategy === "vertical")).toBeDefined();
  });
  it("identifies an iron condor (4 legs: short call/long call/short put/long put)", () => {
    const out = classifyPositionsByStrategy(
      [
        opt("SPY", "C", 470, "2026-06-19", -1),
        opt("SPY", "C", 475, "2026-06-19", +1),
        opt("SPY", "P", 430, "2026-06-19", -1),
        opt("SPY", "P", 425, "2026-06-19", +1),
      ],
      NOW,
    );
    expect(out.find((g) => g.strategy === "iron-condor")).toBeDefined();
  });
});
