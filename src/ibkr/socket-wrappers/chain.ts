import { EventName } from "@stoqey/ib";
import type { SocketHandle } from "../socket.js";
import { withRequest } from "../socket.js";

export interface ChainParams {
  exchange: string;
  underlyingConId: number;
  tradingClass: string;
  multiplier: string;
  expirations: string[];
  strikes: number[];
}

export function buildChainWrappers(handle: SocketHandle): {
  reqSecDefOptParams: (symbol: string) => Promise<ChainParams>;
} {
  const { api, ensureConnected, nextReqId } = handle;

  return {
    reqSecDefOptParams: async (symbol: string) => {
      await ensureConnected();
      const reqId = nextReqId();

      const aggregate: ChainParams = {
        exchange: "",
        underlyingConId: 0,
        tradingClass: "",
        multiplier: "",
        expirations: [],
        strikes: [],
      };
      const expSet = new Set<string>();
      const strSet = new Set<number>();

      return withRequest<ChainParams>(api, {
        frameEvent: EventName.securityDefinitionOptionParameter,
        endEvent: EventName.securityDefinitionOptionParameterEnd,
        matchReqId: reqId,
        initial: aggregate,
        onFrame: (buf, args) => {
          // (reqId, exchange, underlyingConId, tradingClass, multiplier, expirations, strikes)
          const [, exchange, underlyingConId, tradingClass, multiplier, expirations, strikes] =
            args as [number, string, number, string, string, string[], number[]];
          if (exchange === "SMART" || !buf.exchange) buf.exchange = exchange;
          buf.underlyingConId = underlyingConId;
          buf.tradingClass = tradingClass;
          buf.multiplier = multiplier;
          for (const e of expirations) expSet.add(e);
          for (const s of strikes) strSet.add(s);
        },
        onEnd: (buf) => {
          buf.expirations = [...expSet].sort();
          buf.strikes = [...strSet].sort((a, b) => a - b);
          return buf;
        },
        fire: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).reqSecDefOptParams(reqId, symbol, "", "STK", 0);
        },
      });
    },
  };
}
