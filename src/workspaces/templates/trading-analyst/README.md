# Trading Analyst Workspace

AI analyst that reads your Trade Republic portfolio and produces trading recommendations.

## What this workspace does

1. Reads your TR portfolio, cash balance, and watchlist via MCP tools
2. Fetches market data, news, and instrument details
3. Analyzes opportunities using technical and fundamental signals
4. Writes recommendations to Inbox — **you approve manually before any trade**

## MCP tools available

| Tool | What it does |
|---|---|
| `trGetCash` | EUR cash balance |
| `trGetPortfolioStatus` | Portfolio value and P&L |
| `trGetWatchlist` | Watched instruments |
| `trGetTicker` | Real-time bid/ask price |
| `trGetInstrument` | Instrument metadata |
| `trGetStock` | Company details and metrics |
| `trGetNews` | Recent news for an ISIN |
| `trGetPerformance` | Price history |
| `trSearchInstruments` | Find ISIN by name/ticker |

## Required environment variables

```
TR_PHONE=+34...   # Trade Republic phone number
TR_PIN=1234       # Trade Republic PIN
```

Set in `.env` at the OpenAlice root. First run requires interactive 2FA — use
`scripts/trade-republic/pytr_readonly_probe.py login` to authenticate.

## Workflow

The agent runs analysis on a schedule or on demand:
1. Reads portfolio + watchlist
2. For each position/candidate: fetches ticker, news, performance
3. Scores opportunity (momentum, news sentiment, risk/reward)
4. Calls `inbox_push` with a structured recommendation (BUY/SELL/HOLD + rationale)
5. You review in the Inbox tab and decide whether to execute manually in the TR app

## No automated execution

Trade Republic access is **read-only**. No orders are placed automatically.
When Alpaca is configured, the agent can stage orders there for approval.
