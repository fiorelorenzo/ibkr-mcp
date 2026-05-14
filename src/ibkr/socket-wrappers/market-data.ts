import { EventName } from "@stoqey/ib";
import type { SocketHandle } from "../socket.js";
import { subscribe } from "../socket.js";

/** IB tick field codes we care about. */
const TICK = {
  BID: 1,
  ASK: 2,
  LAST: 4,
  CLOSE: 9,
  VOLUME: 8,
  // tickOptionComputation fields: 10=bid, 11=ask, 12=last, 13=model
} as const;

/**
 * Generic-tick set required for TWS to emit `tickOptionComputation`
 * (model Greeks + IV) on an option subscription. Without this list,
 * TWS sends only basic price ticks and the wrapper returns NaN Greeks
 * even when the option chain has full market data — this was the
 * root cause of the v0.1.6 bug where `get_market_data` on options
 * returned `bid/ask/last/greeks` all 0/NaN.
 */
const OPTION_GENERIC_TICKS = "100,101,104,105,106,165,221,225,236,258,293,294,318,375,411,456";

/** Timeouts (ms). Options need more headroom: Greek events lag bid/ask by 1-2s. */
const TIMEOUT_STK_MS = 5000;
const TIMEOUT_OPT_MS = 8000;
/** Early-exit dwell — once "enough" fields are populated, wait briefly for trailing ticks then resolve. */
const EARLY_EXIT_DWELL_MS = 200;

export interface MarketDataResult {
  bid?: number;
  ask?: number;
  last?: number;
  close?: number;
  volume?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
  undPrice?: number;
}

function isOptionContract(contract: unknown): boolean {
  const c = (contract ?? {}) as { secType?: string };
  return c.secType === "OPT" || c.secType === "FOP";
}

export function buildMarketDataWrappers(handle: SocketHandle): {
  reqMktData: (contract: unknown, genericTicks?: string) => Promise<MarketDataResult>;
} {
  const { api, ensureConnected, nextReqId } = handle;

  return {
    reqMktData: async (contract, genericTicks) => {
      await ensureConnected();
      const reqId = nextReqId();
      const isOption = isOptionContract(contract);
      // If caller didn't pass an explicit list, supply the full option set
      // for options and an empty string for stocks/indices/forex.
      const ticks = genericTicks ?? (isOption ? OPTION_GENERIC_TICKS : "");
      const timeoutMs = isOption ? TIMEOUT_OPT_MS : TIMEOUT_STK_MS;

      return new Promise<MarketDataResult>((resolve, reject) => {
        const out: MarketDataResult = {};
        let settled = false;
        let earlyExitTimer: ReturnType<typeof setTimeout> | null = null;

        const settle = (fn: () => void): void => {
          if (settled) return;
          settled = true;
          offPrice();
          offSize();
          offOpt();
          offError();
          clearTimeout(timer);
          if (earlyExitTimer) clearTimeout(earlyExitTimer);
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api as any).cancelMktData(reqId);
          } catch {
            /* ignore */
          }
          fn();
        };

        /**
         * Early-exit gate. "Enough" depends on instrument:
         *  - option: bid + ask + (delta OR iv)
         *  - stock:  bid + ask
         * When enough data is in, schedule a short dwell to catch any
         * trailing ticks (e.g. the Greeks frame that follows the first
         * IV emission), then resolve.
         */
        const maybeEarlyExit = (): void => {
          if (settled || earlyExitTimer) return;
          const haveBidAsk = Number.isFinite(out.bid) && Number.isFinite(out.ask);
          if (!haveBidAsk) return;
          if (isOption && !Number.isFinite(out.delta) && !Number.isFinite(out.iv)) return;
          earlyExitTimer = setTimeout(() => {
            settle(() => resolve(out));
          }, EARLY_EXIT_DWELL_MS);
        };

        const onPrice = (...args: unknown[]): void => {
          if (args[0] !== reqId) return;
          const field = args[1] as number;
          const value = args[2] as number;
          if (value === undefined || value === null || value < 0) return;
          if (field === TICK.BID) out.bid = value;
          else if (field === TICK.ASK) out.ask = value;
          else if (field === TICK.LAST) out.last = value;
          else if (field === TICK.CLOSE) out.close = value;
          maybeEarlyExit();
        };
        const onSize = (...args: unknown[]): void => {
          if (args[0] !== reqId) return;
          const field = args[1] as number;
          const value = args[2] as number | undefined;
          if (field === TICK.VOLUME && value !== undefined) out.volume = value;
        };
        const onOpt = (...args: unknown[]): void => {
          if (args[0] !== reqId) return;
          // (reqId, field, iv, delta, optPrice, pvDividend, gamma, vega, theta, undPrice)
          const iv = args[2] as number | undefined;
          const delta = args[3] as number | undefined;
          const gamma = args[6] as number | undefined;
          const vega = args[7] as number | undefined;
          const theta = args[8] as number | undefined;
          const undPrice = args[9] as number | undefined;
          if (iv !== undefined && Number.isFinite(iv) && iv > 0) out.iv = iv;
          if (delta !== undefined && Number.isFinite(delta)) out.delta = delta;
          if (gamma !== undefined && Number.isFinite(gamma)) out.gamma = gamma;
          if (vega !== undefined && Number.isFinite(vega)) out.vega = vega;
          if (theta !== undefined && Number.isFinite(theta)) out.theta = theta;
          if (undPrice !== undefined && Number.isFinite(undPrice) && undPrice > 0)
            out.undPrice = undPrice;
          maybeEarlyExit();
        };
        const onError = (...args: unknown[]): void => {
          if (args[2] !== reqId) return;
          const code = args[1] as number | undefined;
          // Informational notices (2104/2106/2107/2108/2158 = market-data
          // farm status). Ignore — they're not errors for our request.
          if (
            code === 2104 ||
            code === 2106 ||
            code === 2107 ||
            code === 2108 ||
            code === 2158
          )
            return;
          const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
          settle(() => reject(err));
        };

        const offPrice = subscribe(api, EventName.tickPrice, onPrice);
        const offSize = subscribe(api, EventName.tickSize, onSize);
        const offOpt = subscribe(api, EventName.tickOptionComputation, onOpt);
        const offError = subscribe(api, "error", onError);

        const timer = setTimeout(() => {
          settle(() => resolve(out));
        }, timeoutMs);

        try {
          // Streaming mode (snapshot=false): on paper / non-pro accounts,
          // option snapshots require `regulatorySnapshot=true` (paid). With
          // streaming + cancel-on-data we don't need it and Greeks arrive
          // faster.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).reqMktData(reqId, contract, ticks, false, false);
        } catch (e) {
          settle(() => reject(e instanceof Error ? e : new Error(String(e))));
        }
      });
    },
  };
}
