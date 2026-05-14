export type SecType = "STK" | "OPT";
export type Strategy =
  | "leaps"
  | "pmcc"
  | "covered-call"
  | "csp"
  | "wheel"
  | "vertical"
  | "iron-condor"
  | "iron-butterfly"
  | "straddle"
  | "strangle"
  | "collar"
  | "protective-put"
  | "naked-call"
  | "naked-put"
  | "long-stock"
  | "unknown";

export interface Position {
  symbol: string;
  secType: SecType;
  right?: "C" | "P";
  strike?: number;
  expiry?: string; // ISO YYYY-MM-DD
  quantity: number;
}

export interface StrategyGroup {
  strategy: Strategy;
  symbol: string;
  legs: Position[];
}

const MS_PER_DAY = 86_400_000;
function dteFromExpiry(expiry: string, now = new Date()): number {
  return Math.round((new Date(expiry).getTime() - now.getTime()) / MS_PER_DAY);
}

export function classifyPositionsByStrategy(
  positions: Position[],
  now: Date = new Date(),
): StrategyGroup[] {
  const bySymbol = new Map<string, Position[]>();
  for (const p of positions) {
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []);
    bySymbol.get(p.symbol)!.push(p);
  }

  const groups: StrategyGroup[] = [];
  for (const [symbol, legs] of bySymbol) {
    const stock = legs.find((l) => l.secType === "STK");
    const opts = legs.filter((l) => l.secType === "OPT");
    const longCalls = opts.filter((l) => l.right === "C" && l.quantity > 0);
    const shortCalls = opts.filter((l) => l.right === "C" && l.quantity < 0);
    const longPuts = opts.filter((l) => l.right === "P" && l.quantity > 0);
    const shortPuts = opts.filter((l) => l.right === "P" && l.quantity < 0);

    // Iron condor: 1 short call + 1 long call (higher K) + 1 short put + 1 long put (lower K), same expiry
    if (shortCalls.length === 1 && longCalls.length === 1 && shortPuts.length === 1 && longPuts.length === 1) {
      const sameExp =
        shortCalls[0].expiry === longCalls[0].expiry &&
        shortPuts[0].expiry === longPuts[0].expiry &&
        shortCalls[0].expiry === shortPuts[0].expiry;
      if (sameExp && longCalls[0].strike! > shortCalls[0].strike! && longPuts[0].strike! < shortPuts[0].strike!) {
        groups.push({ strategy: "iron-condor", symbol, legs: opts });
        continue;
      }
    }

    // PMCC: long deep-ITM long-dated call + short shorter-dated call
    if (longCalls.length === 1 && shortCalls.length === 1) {
      const longDte = dteFromExpiry(longCalls[0].expiry!, now);
      const shortDte = dteFromExpiry(shortCalls[0].expiry!, now);
      if (longDte > shortDte + 60 && longCalls[0].strike! < shortCalls[0].strike!) {
        groups.push({ strategy: "pmcc", symbol, legs: [longCalls[0], shortCalls[0]] });
        continue;
      }
    }

    // Covered call: 100 shares + short call
    if (stock && stock.quantity >= 100 && shortCalls.length === 1) {
      groups.push({ strategy: "covered-call", symbol, legs: [stock, shortCalls[0]] });
      continue;
    }

    // Vertical (same right, opposite signs, same expiry)
    if (opts.length === 2) {
      const [a, b] = opts;
      if (a.right === b.right && Math.sign(a.quantity) !== Math.sign(b.quantity) && a.expiry === b.expiry) {
        groups.push({ strategy: "vertical", symbol, legs: opts });
        continue;
      }
    }

    // LEAPS standalone: single long call/put with DTE > 365
    if (opts.length === 1 && opts[0].quantity > 0 && dteFromExpiry(opts[0].expiry!, now) > 365) {
      groups.push({ strategy: "leaps", symbol, legs: opts });
      continue;
    }

    // CSP: single short put, no offsetting long
    if (opts.length === 1 && opts[0].right === "P" && opts[0].quantity < 0) {
      groups.push({ strategy: "csp", symbol, legs: opts });
      continue;
    }

    // Naked call
    if (opts.length === 1 && opts[0].right === "C" && opts[0].quantity < 0) {
      groups.push({ strategy: "naked-call", symbol, legs: opts });
      continue;
    }

    // Long stock only
    if (stock && opts.length === 0) {
      groups.push({ strategy: "long-stock", symbol, legs: [stock] });
      continue;
    }

    groups.push({ strategy: "unknown", symbol, legs });
  }

  return groups;
}
