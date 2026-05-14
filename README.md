# @fiorelorenzo/ibkr-mcp

> MCP server for Interactive Brokers — account, positions, option chains, options analytics (Black-Scholes / Greeks / IV / PMCC / roll), and market context (earnings, dividends, fundamentals, 52w, universe screening). Read-only by default.

## Install

```bash
npx -y @fiorelorenzo/ibkr-mcp
```

Or as a dependency in another project: `npm install @fiorelorenzo/ibkr-mcp`.

## Quick start — Claude Code

Add this server to your `.mcp.json`:

```json
{
  "mcpServers": {
    "ibkr-mcp": {
      "command": "npx",
      "args": ["-y", "@fiorelorenzo/ibkr-mcp"],
      "env": {
        "IBKR_MODE": "socket",
        "IBKR_HOST": "127.0.0.1",
        "IBKR_PORT": "4002",
        "IBKR_CLIENT_ID": "42",
        "IBKR_PAPER_TRADING": "true",
        "IBKR_ALLOW_ORDERS": "false"
      }
    }
  }
}
```

Make sure TWS or IB Gateway is running and accepting API connections on the configured port.

## Configuration (env vars)

| Variable | Default | Description |
| --- | --- | --- |
| `IBKR_MODE` | `oauth` | `oauth` (not yet implemented — v0.2) or `socket` |
| `IBKR_HOST` | `127.0.0.1` | TWS / IB Gateway host |
| `IBKR_PORT` | `4002` | `4002` paper / `4001` live (Gateway); `7497` / `7496` (TWS) |
| `IBKR_CLIENT_ID` | `42` | Any unused client id |
| `IBKR_ACCOUNT_ID` | _(unset)_ | Required only for multi-account login |
| `IBKR_PAPER_TRADING` | `true` | |
| `IBKR_ALLOW_ORDERS` | `false` | Must be explicitly `true` to enable `place_order` / `cancel_order` |
| `IBKR_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `IBKR_MCP_CACHE_DIR` | `~/.cache/ibkr-mcp` | Override the universe constituents cache directory |

## Tools

### Analytics (9) — pure math, no I/O

`bs_price`, `greeks_from_price`, `implied_volatility`, `prob_itm`, `expected_move`, `pmcc_evaluator`, `roll_analyzer`, `evaluate_multi_leg`, `classify_positions_by_strategy`

### Market context (6) — Yahoo Finance

`get_earnings_date`, `get_dividend_calendar`, `get_dividend_ex_dates_next_n_days`, `get_fundamentals`, `get_52w_context`, `screen_universe`

### IBKR broker (13) — read-only by default; `place_order` / `cancel_order` gated by `IBKR_ALLOW_ORDERS=true`

`get_account_summary`, `get_positions`, `get_pnl_per_position`, `get_market_data` (returns broker-computed Greeks + IV for option contracts), `get_option_chain`, `get_historical_bars`, `get_live_orders`, `get_order_status`, `get_flex_query`, `list_flex_queries`, `forget_flex_query`, `place_order`, `cancel_order`

## Read-only by default

`place_order` and `cancel_order` throw unless `IBKR_ALLOW_ORDERS=true`. This is intentional: the design is for an agent to *propose* orders that the user reviews and clicks manually in TWS. Set `IBKR_ALLOW_ORDERS=true` only if you have your own audit/confirmation step before the agent calls `place_order`.

## Known limitations (v0.1)

- **OAuth headless mode is not implemented.** Set `IBKR_MODE=socket` and run TWS or IB Gateway manually. Will land in v0.2.
- **Universe constituents are limited to the top ~10 holdings of the benchmark ETF** (`SPY` → S&P 500, `QQQ` → NDX 100, `DIA` → Dow 30, `IWM` → Russell). Yahoo's `topHoldings.holdings` endpoint does not return the full index. v0.2 will backfill via a second source.
- **`get_pnl_per_position` is derived from `get_positions` and filters by symbol.** No `conId` lookup yet.

## Development

```bash
git clone https://github.com/fiorelorenzo/ibkr-mcp.git
cd ibkr-mcp
npm install
npm test         # 65 tests, no broker required
npm run smoke    # spawns the server over stdio and runs initialize/list/call
npm run build
```

## License

MIT — see [LICENSE](./LICENSE).
