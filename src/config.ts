import { z } from "zod";

const ConfigSchema = z.object({
  IBKR_MODE: z.enum(["oauth", "socket"]).default("oauth"),
  IBKR_HOST: z.string().default("127.0.0.1"),
  IBKR_PORT: z.coerce.number().default(4002),
  IBKR_CLIENT_ID: z.coerce.number().default(42),
  IBKR_ACCOUNT_ID: z.string().optional(),
  IBKR_PAPER_TRADING: z.coerce.boolean().default(true),
  IBKR_ALLOW_ORDERS: z.coerce.boolean().default(false),
  IBKR_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
