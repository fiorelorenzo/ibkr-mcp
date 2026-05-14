import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { yahooClient } from "./yahoo.js";

export type Universe = "sp500" | "ndx100" | "dow30" | "russell1000";

const ETF_FOR_UNIVERSE: Record<Universe, string> = {
  sp500: "SPY",
  ndx100: "QQQ",
  dow30: "DIA",
  russell1000: "IWM",
};

const TTL_MS = 24 * 60 * 60 * 1000;

function cacheDir(): string {
  return process.env.IBKR_MCP_CACHE_DIR ?? join(homedir(), ".cache", "ibkr-mcp");
}

function cachePath(universe: Universe): string {
  return join(cacheDir(), "universes", `${universe}.json`);
}

function readCache(universe: Universe): string[] | null {
  const path = cachePath(universe);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { ts: number; symbols: string[] };
  if (Date.now() - raw.ts > TTL_MS) return null;
  return raw.symbols;
}

function writeCache(universe: Universe, symbols: string[]): void {
  const path = cachePath(universe);
  mkdirSync(join(cacheDir(), "universes"), { recursive: true });
  writeFileSync(path, JSON.stringify({ ts: Date.now(), symbols }));
}

export async function getUniverseConstituents(universe: Universe): Promise<string[]> {
  const cached = readCache(universe);
  if (cached) return cached;

  const etf = ETF_FOR_UNIVERSE[universe];
  const s = (await yahooClient.summary(etf, ["topHoldings"])) as {
    topHoldings?: { holdings?: Array<{ symbol: string }> };
  };
  const symbols = (s.topHoldings?.holdings ?? []).map((h) => h.symbol).filter(Boolean);
  if (symbols.length === 0) {
    throw new Error(`No constituents returned for ${universe} from ${etf}`);
  }
  writeCache(universe, symbols);
  return symbols;
}
