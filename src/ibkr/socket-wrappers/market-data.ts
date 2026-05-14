import { EventName } from "@stoqey/ib";
import type { SocketHandle } from "../socket.js";
import { DEFAULT_REQ_TIMEOUT_MS, subscribe } from "../socket.js";

/** IB tick field codes we care about. */
const TICK = {
  BID: 1,
  ASK: 2,
  LAST: 4,
  CLOSE: 9,
  VOLUME: 8,
  // tickOptionComputation fields: 10=bid, 11=ask, 12=last, 13=model
} as const;

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

export function buildMarketDataWrappers(handle: SocketHandle): {
  reqMktData: (contract: unknown, genericTicks?: string) => Promise<MarketDataResult>;
} {
  const { api, ensureConnected, nextReqId } = handle;

  return {
    reqMktData: async (contract, genericTicks = "") => {
      await ensureConnected();
      const reqId = nextReqId();

      return new Promise<MarketDataResult>((resolve, reject) => {
        const out: MarketDataResult = {};
        let settled = false;
        const settle = (fn: () => void): void => {
          if (settled) return;
          settled = true;
          offPrice();
          offSize();
          offOpt();
          offError();
          clearTimeout(timer);
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api as any).cancelMktData(reqId);
          } catch {
            /* ignore */
          }
          fn();
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
          if (iv !== undefined && iv > 0) out.iv = iv;
          if (delta !== undefined && Number.isFinite(delta)) out.delta = delta;
          if (gamma !== undefined && Number.isFinite(gamma)) out.gamma = gamma;
          if (vega !== undefined && Number.isFinite(vega)) out.vega = vega;
          if (theta !== undefined && Number.isFinite(theta)) out.theta = theta;
          if (undPrice !== undefined && Number.isFinite(undPrice) && undPrice > 0)
            out.undPrice = undPrice;
        };
        const onError = (...args: unknown[]): void => {
          if (args[2] !== reqId) return;
          const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
          settle(() => reject(err));
        };

        const offPrice = subscribe(api, EventName.tickPrice, onPrice);
        const offSize = subscribe(api, EventName.tickSize, onSize);
        const offOpt = subscribe(api, EventName.tickOptionComputation, onOpt);
        const offError = subscribe(api, "error", onError);

        // Snapshot-style: collect ticks for up to DEFAULT timeout, then resolve
        // with whatever we've gathered. Most LEAPS/PMCC analytics tolerate
        // missing fields (the caller can decide what to do with undefined).
        const timer = setTimeout(() => {
          settle(() => resolve(out));
        }, DEFAULT_REQ_TIMEOUT_MS);

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).reqMktData(reqId, contract, genericTicks, false, false);
        } catch (e) {
          settle(() => reject(e instanceof Error ? e : new Error(String(e))));
        }
      });
    },
  };
}
