import { yahooClient } from "./yahoo.js";

export type ResolutionMethod =
  | "caller-hint"
  | "direct"
  | "caret-prefix"
  | "search-best-match"
  | "web-search-duckduckgo"
  | "web-search-wikipedia";

export interface ResolvedQuote {
  /** The symbol literally requested */
  requestedSymbol: string;
  /** The symbol Yahoo actually returned a price for (e.g. "^GSPC" for "SPX") */
  resolvedSymbol: string;
  /** How the resolution was achieved */
  resolutionMethod: ResolutionMethod;
  price: number;
  /** True only when resolvedSymbol === requestedSymbol (no proxy). */
  isExact: boolean;
  /** Optional human-readable name if Yahoo returned it ("SPDR S&P 500 ETF Trust"). */
  longName?: string;
}

export interface ResolveOptions {
  /** Caller-supplied candidate proxy symbols to validate before any other step. */
  hintSymbols?: string[];
}

const HTTP_TIMEOUT_MS = 4000;
const MAX_WEB_CANDIDATES = 5;
const USER_AGENT =
  "@fiorelorenzo/ibkr-mcp/0.1.6 (+https://github.com/fiorelorenzo/ibkr-mcp)";

// Common English words / generic tokens that look like tickers but aren't useful.
const DENYLIST = new Set([
  "THE",
  "AND",
  "FOR",
  "IS",
  "ARE",
  "WAS",
  "WERE",
  "BE",
  "BEEN",
  "BEING",
  "OF",
  "TO",
  "IN",
  "ON",
  "AT",
  "BY",
  "AS",
  "OR",
  "AN",
  "A",
  "I",
  "IT",
  "ITS",
  "IF",
  "NOT",
  "NO",
  "YES",
  "ETF",
  "ETN",
  "INC",
  "LTD",
  "LLC",
  "CO",
  "CORP",
  "PLC",
  "GROUP",
  "NEW",
  "OLD",
  "TOP",
  "ALL",
  "ANY",
  "ONE",
  "TWO",
  "USA",
  "US",
  "UK",
  "EU",
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "CEO",
  "CFO",
  "IPO",
  "SEC",
  "FED",
  "API",
  "URL",
  "FAQ",
  "NYSE",
  "AMEX",
  "CBOE",
  "OTC",
  "WHO",
  "WHY",
  "HOW",
  "WHEN",
  "WHAT",
  "FROM",
  "WITH",
  "THIS",
  "THAT",
  "THESE",
  "THOSE",
  "OPEN",
  "HIGH",
  "LOW",
  "CALL",
  "PUT",
  "BUY",
  "SELL",
]);

// Match standalone all-caps tokens (whole "words"), optionally caret-prefixed,
// optionally with a dot/dash subclass suffix. The lookarounds ensure we don't
// match fragments of longer mixed-case words (e.g. "OPTION" → "OPTIO" + "N").
const TICKER_RE =
  /(?<![A-Za-z0-9])\^?[A-Z]{1,5}(?:[.-][A-Z]{1,3})?(?![A-Za-z0-9])/g;

async function fetchWithTimeout(
  url: string,
  ms = HTTP_TIMEOUT_MS,
): Promise<Response | null> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      try {
        ctrl.abort();
      } catch {
        /* noop */
      }
      resolve(null);
    }, ms);
  });
  try {
    const fetchPromise = fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    }).catch(() => null);
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    return (result as Response | null) ?? null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface YQuote {
  regularMarketPrice?: number | null;
  longName?: string;
  symbol?: string;
}

async function tryQuote(sym: string): Promise<YQuote | null> {
  try {
    const q = (await yahooClient.quote(sym)) as YQuote | null;
    const price = q?.regularMarketPrice;
    if (typeof price === "number" && Number.isFinite(price)) {
      return q;
    }
    return null;
  } catch {
    return null;
  }
}

function extractTickers(text: string, requestedUpper: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  // Match against the ORIGINAL text (case-sensitive) so we only pick tokens
  // that already appear in ALL CAPS — that's what real tickers look like in
  // running prose. The lookarounds enforce whole-token matching.
  const matches = text.match(TICKER_RE) ?? [];
  for (const raw of matches) {
    const bare = raw.startsWith("^") ? raw.slice(1) : raw;
    if (bare.length < 1 || bare.length > 6) continue;
    if (DENYLIST.has(bare)) continue;
    if (bare === requestedUpper) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= MAX_WEB_CANDIDATES) break;
  }
  return out;
}

async function validateCandidates(
  requested: string,
  candidates: string[],
  method: ResolutionMethod,
): Promise<ResolvedQuote | null> {
  for (const sym of candidates) {
    const q = await tryQuote(sym);
    if (q) {
      const resolvedSymbol = q.symbol ?? sym;
      return {
        requestedSymbol: requested,
        resolvedSymbol,
        resolutionMethod: method,
        price: q.regularMarketPrice as number,
        isExact: resolvedSymbol === requested,
        longName: q.longName,
      };
    }
  }
  return null;
}

async function tryDuckDuckGo(
  symbol: string,
): Promise<ResolvedQuote | null> {
  const q = `${symbol} ticker symbol underlying yahoo finance`;
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const d = data as {
    AbstractText?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string }>;
  };
  const parts: string[] = [];
  if (typeof d.AbstractText === "string") parts.push(d.AbstractText);
  if (typeof d.Heading === "string") parts.push(d.Heading);
  if (Array.isArray(d.RelatedTopics)) {
    for (const t of d.RelatedTopics) {
      if (t && typeof t.Text === "string") parts.push(t.Text);
    }
  }
  const text = parts.join(" \n ");
  const tickers = extractTickers(text, symbol.toUpperCase());
  if (tickers.length === 0) return null;
  return validateCandidates(symbol, tickers, "web-search-duckduckgo");
}

async function tryWikipedia(
  symbol: string,
): Promise<ResolvedQuote | null> {
  // Step a: direct summary
  let extract: string | undefined;
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(symbol)}`;
  const res = await fetchWithTimeout(summaryUrl);
  if (res && res.ok) {
    try {
      const data = (await res.json()) as { extract?: string };
      extract = data?.extract;
    } catch {
      // fall through to opensearch
    }
  }

  // Step b: opensearch fallback
  if (!extract) {
    const openUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(symbol)}&format=json`;
    const openRes = await fetchWithTimeout(openUrl);
    if (!openRes || !openRes.ok) return null;
    let openData: unknown;
    try {
      openData = await openRes.json();
    } catch {
      return null;
    }
    // opensearch returns: [query, [titles], [descs], [urls]]
    if (!Array.isArray(openData) || openData.length < 2) return null;
    const titles = openData[1];
    if (!Array.isArray(titles) || titles.length === 0) return null;
    const firstTitle = titles[0];
    if (typeof firstTitle !== "string") return null;
    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;
    const sumRes = await fetchWithTimeout(sumUrl);
    if (!sumRes || !sumRes.ok) return null;
    try {
      const data = (await sumRes.json()) as { extract?: string };
      extract = data?.extract;
    } catch {
      return null;
    }
  }

  if (!extract) return null;
  const tickers = extractTickers(extract, symbol.toUpperCase());
  if (tickers.length === 0) return null;
  return validateCandidates(symbol, tickers, "web-search-wikipedia");
}

/**
 * Generic Yahoo-resolution cascade.
 *
 *  0. Caller-supplied hint symbols (if any).
 *  1. Direct quote on the literal symbol.
 *  2. `^SYMBOL` (CBOE / index convention on Yahoo).
 *  3. Yahoo Search → quote the first candidate that returns a finite price.
 *  4. DuckDuckGo Instant Answer API → extract candidate tickers, validate via Yahoo.
 *  5. Wikipedia REST API → extract candidate tickers, validate via Yahoo.
 *
 * Returns `null` if none of the steps yield a finite, positive price.
 * Never throws.
 */
export async function resolveYahooQuote(
  symbol: string,
  opts?: ResolveOptions,
): Promise<ResolvedQuote | null> {
  // Step 0: caller hints
  if (opts?.hintSymbols && opts.hintSymbols.length > 0) {
    const hinted = await validateCandidates(
      symbol,
      opts.hintSymbols.slice(0, MAX_WEB_CANDIDATES),
      "caller-hint",
    );
    if (hinted) return hinted;
  }

  // Steps 1-2: direct + caret-prefix
  const directCandidates: Array<{ sym: string; method: ResolutionMethod }> = [
    { sym: symbol, method: "direct" },
    { sym: `^${symbol}`, method: "caret-prefix" },
  ];
  for (const { sym, method } of directCandidates) {
    const q = await tryQuote(sym);
    if (q) {
      const resolvedSymbol = q.symbol ?? sym;
      return {
        requestedSymbol: symbol,
        resolvedSymbol,
        resolutionMethod: method,
        price: q.regularMarketPrice as number,
        isExact: resolvedSymbol === symbol,
        longName: q.longName,
      };
    }
  }

  // Step 3: Yahoo search
  try {
    const results = (await yahooClient.search(symbol)) as {
      quotes?: Array<{
        symbol: string;
        quoteType?: string;
        longname?: string;
        shortname?: string;
      }>;
    };
    for (const r of results?.quotes ?? []) {
      if (!r.symbol) continue;
      const q = await tryQuote(r.symbol);
      if (q) {
        const resolvedSymbol = q.symbol ?? r.symbol;
        return {
          requestedSymbol: symbol,
          resolvedSymbol,
          resolutionMethod: "search-best-match",
          price: q.regularMarketPrice as number,
          isExact: resolvedSymbol === symbol,
          longName: q.longName ?? r.longname ?? r.shortname,
        };
      }
    }
  } catch {
    // search itself failed; continue to web fallbacks
  }

  // Step 4: DuckDuckGo
  try {
    const ddg = await tryDuckDuckGo(symbol);
    if (ddg) return ddg;
  } catch {
    // fall through
  }

  // Step 5: Wikipedia
  try {
    const wiki = await tryWikipedia(symbol);
    if (wiki) return wiki;
  } catch {
    // fall through
  }

  return null;
}
