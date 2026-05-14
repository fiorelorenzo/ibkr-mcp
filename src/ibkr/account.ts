import type { BrokerClient } from "./connection.js";
import type { AccountSummary, OptionGreeks, Position } from "./types.js";

export async function getAccountSummary(client: BrokerClient): Promise<AccountSummary> {
  const raw = (await client.reqAccountSummary()) as Record<string, number | string>;
  return {
    accountId: String(raw.AccountCode ?? ""),
    netLiq: Number(raw.NetLiquidation ?? 0),
    buyingPower: Number(raw.BuyingPower ?? 0),
    excessLiquidity: Number(raw.ExcessLiquidity ?? 0),
    initMargin: Number(raw.InitMarginReq ?? 0),
    maintMargin: Number(raw.MaintMarginReq ?? 0),
  };
}

/**
 * Normalize an option expiry to ISO `YYYY-MM-DD`. @stoqey/ib returns the
 * compact `YYYYMMDD` form for option contracts; downstream analytics
 * (`classify_positions_by_strategy`) expect the ISO form, so we normalize here.
 */
function normalizeExpiry(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function asGreeks(g: unknown): OptionGreeks | undefined {
  if (!g || typeof g !== "object") return undefined;
  const r = g as Record<string, unknown>;
  const out: OptionGreeks = {
    delta: Number(r.delta ?? NaN),
    gamma: Number(r.gamma ?? NaN),
    theta: Number(r.theta ?? NaN),
    vega: Number(r.vega ?? NaN),
    iv: Number(r.iv ?? r.impliedVolatility ?? NaN),
  };
  // Only return if at least delta + iv look numeric.
  if (!Number.isFinite(out.delta) || !Number.isFinite(out.iv)) return undefined;
  return out;
}

export async function getPositions(client: BrokerClient): Promise<Position[]> {
  const raw = (await client.reqPositions()) as Array<Record<string, unknown>>;
  return raw.map((r): Position => {
    const secType = String(r.secType);
    if (secType === "OPT") {
      return {
        symbol: String(r.symbol),
        secType: "OPT",
        right: r.right as "C" | "P",
        strike: Number(r.strike),
        expiry: normalizeExpiry(r.expiry ?? r.lastTradeDateOrContractMonth),
        quantity: Number(r.position),
        avgCost: Number(r.avgCost),
        marketPrice: Number(r.marketPrice ?? 0),
        unrealizedPnl: Number(r.unrealizedPNL ?? 0),
        greeks: asGreeks(r.modelGreeks),
      };
    }
    return {
      symbol: String(r.symbol),
      secType: "STK",
      quantity: Number(r.position),
      avgCost: Number(r.avgCost),
      marketPrice: Number(r.marketPrice ?? 0),
      unrealizedPnl: Number(r.unrealizedPNL ?? 0),
    };
  });
}
