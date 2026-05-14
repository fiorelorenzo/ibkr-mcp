import type { BrokerClient } from "./connection.js";

export interface DiagnoseResult {
  connected: boolean;
  pingMs?: number;
  pingError?: string;
  stockTest: {
    symbol: string;
    bid?: number;
    ask?: number;
    last?: number;
    ok: boolean;
    reason?: string;
  };
  optionTest: {
    symbol: string;
    ok: boolean;
    bid?: number;
    ask?: number;
    delta?: number;
    iv?: number;
    reason?: string;
  };
  recentErrors: Array<{ timestamp: number; message: string; code?: number; reqId?: number }>;
}

/**
 * Run a battery of probes against the broker socket to help disambiguate
 * "no market-data subscription" from "wrong code path / connection issue".
 *
 * Never throws — every probe is wrapped and its failure recorded on the
 * structured result.
 */
export async function diagnoseConnection(client: BrokerClient): Promise<DiagnoseResult> {
  const result: DiagnoseResult = {
    connected: false,
    stockTest: { symbol: "SPY", ok: false },
    optionTest: { symbol: "SPY-option", ok: false },
    recentErrors: [],
  };

  result.connected = client.isConnected ? client.isConnected() : true;

  if (client.ping) {
    try {
      result.pingMs = await client.ping(2000);
    } catch (e) {
      result.pingError = e instanceof Error ? e.message : String(e);
    }
  }

  // Stock probe — SPY is universally subscribed even on minimal feeds.
  try {
    const md = (await client.reqMktData(
      { symbol: "SPY", secType: "STK", exchange: "SMART", currency: "USD" },
      "",
    )) as { bid?: number; ask?: number; last?: number };
    result.stockTest.bid = md.bid;
    result.stockTest.ask = md.ask;
    result.stockTest.last = md.last;
    const hasPrice =
      (typeof md.bid === "number" && md.bid > 0) ||
      (typeof md.ask === "number" && md.ask > 0) ||
      (typeof md.last === "number" && md.last > 0);
    result.stockTest.ok = hasPrice;
    if (!hasPrice)
      result.stockTest.reason =
        "no bid/ask/last within timeout; likely no market data subscription for SPY";
  } catch (e) {
    result.stockTest.reason = e instanceof Error ? e.message : String(e);
  }

  // Option probe — only attempt if we got a stock price (we need spot to
  // pick a near-ATM strike). Otherwise skip with an informative reason.
  const spot = result.stockTest.last ?? result.stockTest.ask ?? result.stockTest.bid;
  if (typeof spot === "number" && spot > 0) {
    // Pick the next-Friday weekly. Strikes on SPY are $1 increments, so
    // round to the nearest dollar.
    const strike = Math.round(spot);
    const expiry = nextFridayYYYYMMDD();
    result.optionTest.symbol = `SPY ${expiry} ${strike}C`;
    try {
      const md = (await client.reqMktData({
        symbol: "SPY",
        secType: "OPT",
        exchange: "SMART",
        currency: "USD",
        right: "C",
        strike,
        expiry,
      })) as { bid?: number; ask?: number; delta?: number; iv?: number };
      result.optionTest.bid = md.bid;
      result.optionTest.ask = md.ask;
      result.optionTest.delta = md.delta;
      result.optionTest.iv = md.iv;
      const haveBidAsk = typeof md.bid === "number" && typeof md.ask === "number";
      const haveGreeks =
        (typeof md.delta === "number" && Number.isFinite(md.delta)) ||
        (typeof md.iv === "number" && Number.isFinite(md.iv));
      result.optionTest.ok = haveBidAsk && haveGreeks;
      if (!result.optionTest.ok) {
        if (!haveBidAsk)
          result.optionTest.reason =
            "no bid/ask within timeout; check options market data subscription";
        else if (!haveGreeks)
          result.optionTest.reason =
            "no greeks within timeout; check options market data subscription or generic-tick wiring";
      }
    } catch (e) {
      result.optionTest.reason = e instanceof Error ? e.message : String(e);
    }
  } else {
    result.optionTest.reason = "skipped — no spot price for SPY";
  }

  if (client.getRecentErrors) {
    result.recentErrors = client.getRecentErrors(60_000);
  }

  return result;
}

function nextFridayYYYYMMDD(): string {
  const d = new Date();
  // 0=Sun..6=Sat — target Friday=5
  const dow = d.getUTCDay();
  const delta = (5 - dow + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
