import { IBApi, EventName } from "@stoqey/ib";
import type { Config } from "../config.js";
import type { BrokerClient } from "./connection.js";

/**
 * Internal handle that exposes the underlying IBApi instance and a
 * connection lifecycle helper. Used by the per-feature modules
 * (account.ts, market-data.ts, chain.ts, history.ts, orders.ts) which
 * need direct access to event subscription and request IDs.
 */
export interface SocketHandle {
  api: IBApi;
  /** Resolves once the IBApi has emitted `connected`. Idempotent. */
  ensureConnected(): Promise<void>;
  /** Returns the next monotonically increasing reqId. */
  nextReqId(): number;
}

/**
 * Default per-request timeout in milliseconds. Many wrappers accept a
 * caller-supplied override.
 */
export const DEFAULT_REQ_TIMEOUT_MS = 5000;

/**
 * Helper: subscribe `listener` to `event` for the lifetime of the returned
 * cleanup function. Used so wrappers always tear down their listeners
 * before resolving — preventing reqId cross-talk between calls.
 */
export function subscribe(
  api: IBApi,
  event: string,
  listener: (...args: unknown[]) => void,
): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (api as any).on(event, listener);
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api as any).off?.(event, listener);
  };
}

/**
 * Promise wrapper around an event-driven IB request. Accumulates frames
 * via `onFrame`, resolves with the buffer on `endEvent`, rejects on
 * `error` or timeout. Always tears down listeners before settling.
 */
export function withRequest<T>(
  api: IBApi,
  opts: {
    frameEvent: string;
    endEvent: string;
    timeoutMs?: number;
    matchReqId?: number;
    /** Called for each frame event. Should append to the buffer. */
    onFrame: (buf: T, args: unknown[]) => void;
    /** Called once on endEvent — may mutate or return a final value. */
    onEnd?: (buf: T, args: unknown[]) => T;
    initial: T;
    /** Called synchronously to fire the actual reqXxx call on the API. */
    fire: () => void;
    /** Called on settle (resolve or reject) to cancel the IB subscription. */
    cleanup?: () => void;
  },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let buf = opts.initial;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      offFrame();
      offEnd();
      offError();
      clearTimeout(timer);
      try {
        opts.cleanup?.();
      } catch {
        /* swallow cleanup errors */
      }
      fn();
    };

    const frameListener: (...args: unknown[]) => void = (...args) => {
      if (opts.matchReqId !== undefined && args[0] !== opts.matchReqId) return;
      opts.onFrame(buf, args);
    };
    const endListener: (...args: unknown[]) => void = (...args) => {
      if (opts.matchReqId !== undefined && args[0] !== opts.matchReqId) return;
      if (opts.onEnd) buf = opts.onEnd(buf, args);
      settle(() => resolve(buf));
    };
    const errorListener: (...args: unknown[]) => void = (...args) => {
      // IB emits errors as (error, code, reqId) — bail only if the reqId
      // matches (or matchReqId is unset, in which case we treat all errors
      // as fatal for this request).
      const errReqId = args[2];
      if (opts.matchReqId !== undefined && errReqId !== opts.matchReqId) return;
      const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
      settle(() => reject(err));
    };

    const offFrame = subscribe(api, opts.frameEvent, frameListener);
    const offEnd = subscribe(api, opts.endEvent, endListener);
    const offError = subscribe(api, "error", errorListener);

    const timer = setTimeout(() => {
      settle(() =>
        reject(new Error(`IB request timed out after ${opts.timeoutMs ?? DEFAULT_REQ_TIMEOUT_MS}ms`)),
      );
    }, opts.timeoutMs ?? DEFAULT_REQ_TIMEOUT_MS);

    try {
      opts.fire();
    } catch (e) {
      settle(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}

export async function createSocketClient(config: Config): Promise<BrokerClient> {
  const api = new IBApi({
    host: config.IBKR_HOST,
    port: config.IBKR_PORT,
    clientId: config.IBKR_CLIENT_ID,
  });

  let connectPromise: Promise<void> | null = null;
  let nextId = 1;

  const ensureConnected = (): Promise<void> => {
    if (!connectPromise) {
      connectPromise = new Promise<void>((resolve, reject) => {
        const onConnected = (): void => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).off?.(EventName.error, onError);
          resolve();
        };
        const onError = (err: unknown): void => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).off?.(EventName.connected, onConnected);
          reject(err instanceof Error ? err : new Error(String(err)));
        };
        api.once(EventName.connected, onConnected);
        api.once(EventName.error, onError);
        api.connect();
      });
    }
    return connectPromise;
  };

  const handle: SocketHandle = {
    api,
    ensureConnected,
    nextReqId: () => nextId++,
  };

  // Wrappers are added in subsequent tasks; we use the handle to keep
  // a single source of truth for the api instance + reqId allocator.
  const { buildAccountWrappers } = await import("./socket-wrappers/account.js");
  const { buildMarketDataWrappers } = await import("./socket-wrappers/market-data.js");
  const { buildChainWrappers } = await import("./socket-wrappers/chain.js");
  const { buildHistoryWrappers } = await import("./socket-wrappers/history.js");
  const { buildOrderWrappers } = await import("./socket-wrappers/orders.js");

  return {
    connect: async () => {
      await ensureConnected();
    },
    disconnect: async () => {
      api.disconnect();
      connectPromise = null;
    },
    ...buildAccountWrappers(handle),
    ...buildMarketDataWrappers(handle),
    ...buildChainWrappers(handle),
    ...buildHistoryWrappers(handle),
    ...buildOrderWrappers(handle),
  };
}
