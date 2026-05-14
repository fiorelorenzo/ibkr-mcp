import { z } from "zod";
import { bsPrice, bsGreeks } from "../analytics/bs.js";
import { impliedVolatility } from "../analytics/iv.js";
import { probItm, expectedMove } from "../analytics/prob.js";
import { pmccEvaluator } from "../analytics/pmcc.js";
import { rollAnalyzer } from "../analytics/roll.js";
import { evaluateMultiLeg } from "../analytics/multi-leg.js";
import { classifyPositionsByStrategy } from "../analytics/classify.js";
import { toMcpInputSchema, type ToolDef } from "./zod-helpers.js";

const Right = z.enum(["C", "P"]);

const BsPriceInput = z.object({
  S: z.number().positive(),
  K: z.number().positive(),
  T: z.number().nonnegative(),
  r: z.number(),
  sigma: z.number().positive(),
  right: Right,
  q: z.number().default(0),
});

const IvInput = z.object({
  price: z.number().nonnegative(),
  S: z.number().positive(),
  K: z.number().positive(),
  T: z.number().nonnegative(),
  r: z.number(),
  right: Right,
  q: z.number().default(0),
});

const GreeksFromPriceInput = IvInput; // same shape — derive iv then greeks

const ProbItmInput = z.object({
  S: z.number().positive(),
  K: z.number().positive(),
  T: z.number().nonnegative(),
  r: z.number(),
  sigma: z.number().positive(),
  right: Right,
  q: z.number().default(0),
});

const ExpectedMoveInput = z.object({
  S: z.number().positive(),
  sigma: z.number().positive(),
  days: z.number().nonnegative(),
});

const PmccLegInput = z.object({
  strike: z.number().positive(),
  T: z.number().nonnegative(),
  sigma: z.number().positive(),
  entryDebit: z.number().optional(),
  entryCredit: z.number().optional(),
  mark: z.number().optional(),
});

const PmccInputSchema = z.object({
  longLeg: PmccLegInput,
  shortLeg: PmccLegInput,
  S: z.number().positive(),
  r: z.number().optional(),
  q: z.number().optional(),
});

const ContractSchema = z.object({
  strike: z.number().positive(),
  T: z.number().nonnegative(),
  sigma: z.number().positive(),
  mark: z.number().optional(),
  right: Right,
});

const RollInputSchema = z.object({
  current: ContractSchema.extend({ mark: z.number() }),
  candidates: z.array(ContractSchema),
  S: z.number().positive(),
  r: z.number().optional(),
  q: z.number().optional(),
});

const LegSchema = z.object({
  qty: z.number(),
  strike: z.number().positive(),
  right: Right,
  premium: z.number().nonnegative(),
  T: z.number().nonnegative(),
  sigma: z.number().positive(),
});

const MultiLegInputSchema = z.object({
  legs: z.array(LegSchema),
  S: z.number().positive(),
  r: z.number().optional(),
  q: z.number().optional(),
});

const PositionSchema = z.object({
  symbol: z.string(),
  secType: z.enum(["STK", "OPT"]),
  right: Right.optional(),
  strike: z.number().optional(),
  expiry: z.string().optional(),
  quantity: z.number(),
});

const ClassifyInputSchema = z.object({
  positions: z.array(PositionSchema),
  now: z.string().datetime().optional(),
});

export const ANALYTICS_TOOL_DEFS: ToolDef[] = [
  {
    name: "bs_price",
    description: "Black-Scholes-Merton price. T in years, sigma decimal (0.30 = 30% IV).",
    inputSchema: toMcpInputSchema(BsPriceInput),
    handler: async (raw) => {
      const input = BsPriceInput.parse(raw);
      return { price: bsPrice(input) };
    },
  },
  {
    name: "greeks_from_price",
    description: "Derive implied vol from a market price then return Greeks + iv.",
    inputSchema: toMcpInputSchema(GreeksFromPriceInput),
    handler: async (raw) => {
      const input = GreeksFromPriceInput.parse(raw);
      const sigma = impliedVolatility(input);
      const greeks = bsGreeks({ ...input, sigma });
      return { iv: sigma, ...greeks };
    },
  },
  {
    name: "implied_volatility",
    description: "Solve implied volatility from a market option price (Brent).",
    inputSchema: toMcpInputSchema(IvInput),
    handler: async (raw) => {
      const input = IvInput.parse(raw);
      return { iv: impliedVolatility(input) };
    },
  },
  {
    name: "prob_itm",
    description: "Risk-neutral probability the option finishes in-the-money (N(d2) for calls).",
    inputSchema: toMcpInputSchema(ProbItmInput),
    handler: async (raw) => {
      const input = ProbItmInput.parse(raw);
      return { probItm: probItm(input) };
    },
  },
  {
    name: "expected_move",
    description: "1-standard-deviation expected move over `days` calendar days.",
    inputSchema: toMcpInputSchema(ExpectedMoveInput),
    handler: async (raw) => {
      const input = ExpectedMoveInput.parse(raw);
      return expectedMove(input);
    },
  },
  {
    name: "pmcc_evaluator",
    description: "Evaluate a PMCC pair: net debit, P&L, breakeven, combined Greeks, cost-basis check.",
    inputSchema: toMcpInputSchema(PmccInputSchema),
    handler: async (raw) => {
      const input = PmccInputSchema.parse(raw);
      return pmccEvaluator(input);
    },
  },
  {
    name: "roll_analyzer",
    description: "Score roll candidates for an option position (net debit/credit, new Greeks).",
    inputSchema: toMcpInputSchema(RollInputSchema),
    handler: async (raw) => {
      const input = RollInputSchema.parse(raw);
      return rollAnalyzer(input);
    },
  },
  {
    name: "evaluate_multi_leg",
    description: "Evaluate a generic multi-leg spread: net credit/debit, max P/L, breakevens, Greeks.",
    inputSchema: toMcpInputSchema(MultiLegInputSchema),
    handler: async (raw) => {
      const input = MultiLegInputSchema.parse(raw);
      const r = evaluateMultiLeg(input);
      // pnlAtExpiry is a function; strip for JSON serialization
      const { pnlAtExpiry: _pnl, ...rest } = r;
      void _pnl;
      return rest;
    },
  },
  {
    name: "classify_positions_by_strategy",
    description: "Group raw positions into option strategies (LEAPS, PMCC, covered call, IC, ...).",
    inputSchema: toMcpInputSchema(ClassifyInputSchema),
    handler: async (raw) => {
      const input = ClassifyInputSchema.parse(raw);
      const now = input.now ? new Date(input.now) : new Date();
      return classifyPositionsByStrategy(input.positions, now);
    },
  },
];
