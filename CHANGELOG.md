# Changelog

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
