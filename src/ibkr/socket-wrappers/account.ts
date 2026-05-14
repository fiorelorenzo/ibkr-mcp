import { EventName } from "@stoqey/ib";
import type { SocketHandle } from "../socket.js";
import { withRequest } from "../socket.js";

const ACCOUNT_TAGS =
  "NetLiquidation,BuyingPower,ExcessLiquidity,InitMarginReq,MaintMarginReq,AccountCode";

export function buildAccountWrappers(handle: SocketHandle): {
  reqAccountSummary: () => Promise<Record<string, string | number>>;
  reqPositions: () => Promise<Array<Record<string, unknown>>>;
} {
  const { api, ensureConnected, nextReqId } = handle;

  return {
    reqAccountSummary: async () => {
      await ensureConnected();
      const reqId = nextReqId();
      return withRequest<Record<string, string | number>>(api, {
        frameEvent: EventName.accountSummary,
        endEvent: EventName.accountSummaryEnd,
        matchReqId: reqId,
        initial: {},
        onFrame: (buf, args) => {
          // (reqId, account, tag, value, currency)
          const tag = args[2] as string;
          const value = args[3] as string;
          buf[tag] = value;
          if (args[1]) buf.AccountCode = String(args[1]);
        },
        fire: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).reqAccountSummary(reqId, "All", ACCOUNT_TAGS);
        },
        cleanup: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api as any).cancelAccountSummary(reqId);
          } catch {
            /* ignore */
          }
        },
      });
    },

    reqPositions: async () => {
      await ensureConnected();
      return withRequest<Array<Record<string, unknown>>>(api, {
        frameEvent: EventName.position,
        endEvent: EventName.positionEnd,
        initial: [],
        onFrame: (buf, args) => {
          // (account, contract, pos, avgCost)
          const [, contractRaw, pos, avgCost] = args as [
            string,
            Record<string, unknown>,
            number,
            number | undefined,
          ];
          const contract = contractRaw ?? {};
          buf.push({
            symbol: contract.symbol,
            secType: contract.secType,
            right: contract.right,
            strike: contract.strike,
            expiry: contract.lastTradeDateOrContractMonth,
            position: pos,
            avgCost: avgCost ?? 0,
          });
        },
        fire: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (api as any).reqPositions();
        },
        cleanup: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api as any).cancelPositions();
          } catch {
            /* ignore */
          }
        },
      });
    },
  };
}
