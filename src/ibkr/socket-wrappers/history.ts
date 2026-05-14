import { EventName } from "@stoqey/ib";
import type { SocketHandle } from "../socket.js";
import { DEFAULT_REQ_TIMEOUT_MS, subscribe } from "../socket.js";

export interface HistoricalQuery {
  endDateTime?: string;
  duration: string;
  barSize: string;
  whatToShow?: string;
  useRTH?: boolean;
  formatDate?: number;
  keepUpToDate?: boolean;
}

export interface RawBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function buildHistoryWrappers(handle: SocketHandle): {
  reqHistoricalData: (contract: unknown, query: unknown) => Promise<RawBar[]>;
} {
  const { api, ensureConnected, nextReqId } = handle;

  return {
    reqHistoricalData: async (contract, query) => {
      await ensureConnected();
      const reqId = nextReqId();
      const q = query as HistoricalQuery;

      return new Promise<RawBar[]>((resolve, reject) => {
        const bars: RawBar[] = [];
        let settled = false;

        const settle = (fn: () => void): void => {
          if (settled) return;
          settled = true;
          offBar();
          offError();
          clearTimeout(timer);
          fn();
        };

        const onBar = (...args: unknown[]): void => {
          if (args[0] !== reqId) return;
          const time = args[1] as string;
          // IB historical data marks completion with a row whose time
          // begins with "finished-". We treat that as the end signal.
          if (typeof time === "string" && time.startsWith("finished-")) {
            settle(() => resolve(bars));
            return;
          }
          bars.push({
            time,
            open: Number(args[2]),
            high: Number(args[3]),
            low: Number(args[4]),
            close: Number(args[5]),
            volume: Number(args[6] ?? 0),
          });
        };
        const onError = (...args: unknown[]): void => {
          if (args[2] !== reqId) return;
          const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
          settle(() => reject(err));
        };

        const offBar = subscribe(api, EventName.historicalData, onBar);
        const offError = subscribe(api, "error", onError);

        const timer = setTimeout(() => {
          settle(() =>
            reject(
              new Error(
                `reqHistoricalData timed out after ${DEFAULT_REQ_TIMEOUT_MS}ms (got ${bars.length} bars)`,
              ),
            ),
          );
        }, DEFAULT_REQ_TIMEOUT_MS);

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).reqHistoricalData(
            reqId,
            contract,
            q.endDateTime ?? "",
            q.duration,
            q.barSize,
            q.whatToShow ?? "TRADES",
            q.useRTH ?? true ? 1 : 0,
            q.formatDate ?? 1,
            q.keepUpToDate ?? false,
          );
        } catch (e) {
          settle(() => reject(e instanceof Error ? e : new Error(String(e))));
        }
      });
    },
  };
}
