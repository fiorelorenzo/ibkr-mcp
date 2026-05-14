import { z } from "zod";
import type { Config } from "../config.js";
import { getBrokerClient } from "../ibkr/connection.js";
import { getAccountSummary, getPositions } from "../ibkr/account.js";
import { getMarketData } from "../ibkr/market-data.js";
import { getOptionChain } from "../ibkr/chain.js";
import { getHistoricalBars } from "../ibkr/history.js";
import {
  getLiveOrders,
  getOrderStatus,
  placeOrder,
  cancelOrder,
} from "../ibkr/orders.js";
import {
  getFlexQuery,
  listFlexQueries,
  forgetFlexQuery,
} from "../ibkr/flex.js";
import { toMcpInputSchema, type ToolDef } from "./zod-helpers.js";

const NoInput = z.object({}).strict();

const ContractInput = z.object({
  symbol: z.string(),
  secType: z.enum(["STK", "OPT", "FUT", "IND", "CASH"]).default("STK"),
  exchange: z.string().default("SMART"),
  currency: z.string().default("USD"),
  right: z.enum(["C", "P"]).optional(),
  strike: z.number().optional(),
  expiry: z.string().optional(),
});

const MarketDataInput = z.object({
  contract: ContractInput,
  genericTicks: z.string().optional(),
});

const OptionChainInput = z.object({
  symbol: z.string(),
  expiry: z.string(),
  concurrency: z.number().int().positive().optional(),
});

const HistoricalBarsInput = z.object({
  symbol: z.string(),
  duration: z.string(),
  barSize: z.string(),
  whatToShow: z.string().optional(),
  useRTH: z.boolean().optional(),
  endDateTime: z.string().optional(),
});

const OrderIdInput = z.object({ orderId: z.number().int() });

const PnlPerPositionInput = z.object({
  conId: z.number().optional(),
  symbol: z.string().optional(),
});

const FlexInput = z.object({
  queryId: z.string(),
  token: z.string(),
  pollMs: z.number().int().nonnegative().optional(),
  maxPolls: z.number().int().positive().optional(),
});

const FlexQueryIdOnly = z.object({ queryId: z.string() });

const OrderSchema = z.object({}).passthrough();

const PlaceOrderInput = z.object({
  contract: ContractInput,
  order: OrderSchema,
});

export function buildIbkrTools(config: Config): ToolDef[] {
  return [
    {
      name: "get_account_summary",
      description:
        "Account summary (NetLiq, buying power, margin, excess liquidity) from IBKR.",
      inputSchema: toMcpInputSchema(NoInput),
      handler: async () => {
        const client = await getBrokerClient(config);
        return getAccountSummary(client);
      },
    },
    {
      name: "get_positions",
      description:
        "All positions (stock and option) with quantity, avg cost, market price, P&L, and option Greeks when available.",
      inputSchema: toMcpInputSchema(NoInput),
      handler: async () => {
        const client = await getBrokerClient(config);
        return getPositions(client);
      },
    },
    {
      name: "get_pnl_per_position",
      description:
        "Per-position unrealized P&L. Filter by `symbol` (and/or `conId` if present in raw data). Without filters, returns all positions.",
      inputSchema: toMcpInputSchema(PnlPerPositionInput),
      handler: async (raw) => {
        const input = PnlPerPositionInput.parse(raw);
        const client = await getBrokerClient(config);
        const positions = await getPositions(client);
        const rows = positions.map((p) => ({
          symbol: p.symbol,
          secType: p.secType,
          quantity: p.quantity,
          avgCost: p.avgCost,
          marketPrice: p.marketPrice,
          unrealizedPnl: p.unrealizedPnl,
          ...(p.secType === "OPT"
            ? { right: p.right, strike: p.strike, expiry: p.expiry }
            : {}),
        }));
        if (input.symbol) {
          return rows.filter((r) => r.symbol === input.symbol);
        }
        return rows;
      },
    },
    {
      name: "get_market_data",
      description:
        "Snapshot market data. Returns bid/ask/last + Greeks (for options). Field 'source' indicates origin: 'ibkr' (live broker), 'yahoo-delayed' (fallback for stocks/indices when IBKR has no subscription), 'unavailable' (no data from either source). Never throws.",
      inputSchema: toMcpInputSchema(MarketDataInput),
      handler: async (raw) => {
        const input = MarketDataInput.parse(raw);
        const client = await getBrokerClient(config);
        return getMarketData(client, input.contract, {
          genericTicks: input.genericTicks,
        });
      },
    },
    {
      name: "get_option_chain",
      description:
        "Full option chain for a symbol/expiry, with per-strike bid/ask/last and Greeks.",
      inputSchema: toMcpInputSchema(OptionChainInput),
      handler: async (raw) => {
        const input = OptionChainInput.parse(raw);
        const client = await getBrokerClient(config);
        return getOptionChain(client, input.symbol, input.expiry, {
          concurrency: input.concurrency,
        });
      },
    },
    {
      name: "get_historical_bars",
      description: "Historical OHLCV bars (IB duration/barSize strings).",
      inputSchema: toMcpInputSchema(HistoricalBarsInput),
      handler: async (raw) => {
        const input = HistoricalBarsInput.parse(raw);
        const client = await getBrokerClient(config);
        return getHistoricalBars(client, input.symbol, {
          duration: input.duration,
          barSize: input.barSize,
          whatToShow: input.whatToShow,
          useRTH: input.useRTH,
          endDateTime: input.endDateTime,
        });
      },
    },
    {
      name: "get_live_orders",
      description: "All currently open/working orders on the account.",
      inputSchema: toMcpInputSchema(NoInput),
      handler: async () => {
        const client = await getBrokerClient(config);
        return getLiveOrders(client);
      },
    },
    {
      name: "get_order_status",
      description: "Status of a specific open order by orderId.",
      inputSchema: toMcpInputSchema(OrderIdInput),
      handler: async (raw) => {
        const { orderId } = OrderIdInput.parse(raw);
        const client = await getBrokerClient(config);
        return getOrderStatus(client, orderId);
      },
    },
    {
      name: "get_flex_query",
      description:
        "Fetch a Flex Web Service report by queryId + token. Cached in memory after first fetch.",
      inputSchema: toMcpInputSchema(FlexInput),
      handler: async (raw) => {
        const input = FlexInput.parse(raw);
        return getFlexQuery(input.queryId, input.token, {
          pollMs: input.pollMs,
          maxPolls: input.maxPolls,
        });
      },
    },
    {
      name: "list_flex_queries",
      description: "List queryIds currently held in the Flex in-memory cache.",
      inputSchema: toMcpInputSchema(NoInput),
      handler: async () => ({ queryIds: listFlexQueries() }),
    },
    {
      name: "forget_flex_query",
      description: "Evict a specific queryId from the Flex cache.",
      inputSchema: toMcpInputSchema(FlexQueryIdOnly),
      handler: async (raw) => {
        const { queryId } = FlexQueryIdOnly.parse(raw);
        forgetFlexQuery(queryId);
        return { ok: true };
      },
    },
    {
      name: "place_order",
      description:
        "Place an order. Gated by IBKR_ALLOW_ORDERS (default false); throws in read-only mode.",
      inputSchema: toMcpInputSchema(PlaceOrderInput),
      handler: async (raw) => {
        const input = PlaceOrderInput.parse(raw);
        const client = await getBrokerClient(config);
        return placeOrder(client, input.contract, input.order, {
          allowOrders: config.IBKR_ALLOW_ORDERS,
        });
      },
    },
    {
      name: "cancel_order",
      description:
        "Cancel an open order. Gated by IBKR_ALLOW_ORDERS (default false); throws in read-only mode.",
      inputSchema: toMcpInputSchema(OrderIdInput),
      handler: async (raw) => {
        const { orderId } = OrderIdInput.parse(raw);
        const client = await getBrokerClient(config);
        await cancelOrder(client, orderId, {
          allowOrders: config.IBKR_ALLOW_ORDERS,
        });
        return { ok: true, orderId };
      },
    },
  ];
}
