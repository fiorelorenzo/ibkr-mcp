# Changelog

## 0.1.3 — 2026-05-14

### Fixed
- `get_market_data` now falls back to Yahoo (delayed) when IBKR throws a subscription/market-data error for STK or IND contracts, not just when it returns NaN. Previously errors propagated and skipped the fallback.
- VIX and other CBOE indices are mapped to their Yahoo symbols (`^VIX`, `^GSPC`, `^NDX`, `^DJI`, `^RUT`) for fallback.

### Changed
- `get_market_data` never throws on missing data. Returns a structured response with `source: "ibkr" | "yahoo-delayed" | "unavailable"` and an optional `error` field. Callers should branch on `source`.

## 0.1.2 — 2026-05-13

### Fixed
- `classify_positions_by_strategy` returned `"unknown"` for every obvious PMCC pair (and any other rule that relied on DTE). Root cause: `@stoqey/ib` exposes option expiries in compact `YYYYMMDD` form (e.g. `"20270617"`), and `new Date("20270617")` returns `Invalid Date`, so every numeric comparison against the resulting NaN DTE failed. `parseExpiry` now handles compact `YYYYMMDD`, ISO `YYYY-MM-DD`, and full date-strings; `getPositions` also normalizes raw broker expiries to ISO `YYYY-MM-DD` so downstream consumers see a uniform format.
- `get_market_data` returned NaN bid/ask/last after a 5-second timeout when called outside RTH (IBKR delivers no ticks for stocks when the market is closed). For **stock** contracts, the snapshot now falls back to a delayed Yahoo quote when IBKR is empty and tags the response with `source: "yahoo-delayed"` / `delayed: true`. The successful broker path is tagged `source: "ibkr"` / `delayed: false`. Option contracts are intentionally **not** backfilled from Yahoo (Greeks/IV would be missing); they keep `source: "ibkr"` so the caller can decide.

### Internal
- New `MarketDataSnapshot.source` (`"ibkr" | "yahoo-delayed"`) and `delayed: boolean` fields so agents can warn the user when prices are delayed.
- Tests added: PMCC + LEAPS classification with compact `YYYYMMDD` expiries; `getPositions` expiry normalization; Yahoo fallback path for stocks; explicit no-fallback for options; no-fabrication when Yahoo also has no price.

## 0.1.1 — 2026-05-14

### Fixed
- `tools/list` now returns standards-compliant JSON Schema for every tool's `inputSchema`. Previously used `zod-to-json-schema` (designed for Zod v3) on Zod v4 schemas, producing schemas that Claude Code's MCP client rejected with "Invalid input: expected object".

### Internal
- Switched to Zod v4's native `z.toJSONSchema()`.
- Removed `zod-to-json-schema` dependency.

## 0.1.0 — 2026-05-13

Initial public release.

### Tools (28)

- **Analytics (9):** `bs_price`, `greeks_from_price`, `implied_volatility`, `prob_itm`, `expected_move`, `pmcc_evaluator`, `roll_analyzer`, `evaluate_multi_leg`, `classify_positions_by_strategy`
- **Market context (6):** `get_earnings_date`, `get_dividend_calendar`, `get_dividend_ex_dates_next_n_days`, `get_fundamentals`, `get_52w_context`, `screen_universe`
- **IBKR (13):** `get_account_summary`, `get_positions`, `get_pnl_per_position`, `get_market_data` (with broker Greeks/IV), `get_option_chain`, `get_historical_bars`, `get_live_orders`, `get_order_status`, `get_flex_query`, `list_flex_queries`, `forget_flex_query`, `place_order` (gated by `IBKR_ALLOW_ORDERS`), `cancel_order` (gated)

### Known limitations
- OAuth headless mode not implemented (set `IBKR_MODE=socket`).
- Universe constituents limited to ETF top holdings (Yahoo `topHoldings` returns top ~10).
- `get_pnl_per_position` is a thin view over `get_positions`.

### Tests
- 65 unit tests (analytics, market-context mocked, IBKR socket mocked, tool registration)
- stdio smoke runner verifies the server boots and `bs_price` is callable via JSON-RPC
