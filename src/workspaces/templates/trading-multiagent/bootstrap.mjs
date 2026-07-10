/**
 * Bootstrap a Trading Multiagent workspace — 5-angle structured analysis.
 * Follows the TradingAgents methodology (fundamentals + technical + sentiment
 * + macro + risk) implemented as Claude instructions over TR MCP tools.
 *
 *   argv:  process.argv[2] = tag, process.argv[3] = outDir (absolute)
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initWorkspaceDir, setupGitExcludes } from '../_common.mjs'

const tag    = process.argv[2]
const outDir = process.argv[3]
if (!tag || !outDir) {
  console.error('usage: bootstrap.mjs <tag> <outDir>')
  process.exit(1)
}

initWorkspaceDir(outDir)
setupGitExcludes(outDir)

mkdirSync(join(outDir, 'analysis'),        { recursive: true })
mkdirSync(join(outDir, 'recommendations'), { recursive: true })
writeFileSync(join(outDir, 'analysis',        '.gitkeep'), '')
writeFileSync(join(outDir, 'recommendations', '.gitkeep'), '')

writeFileSync(join(outDir, 'CLAUDE.md'), `# Trading Multiagent — Agent Context

You are a structured multi-angle trading analyst. For every instrument analysis
you apply 5 lenses, score each 1–5, compute a weighted final score, and derive
a BUY / SELL / HOLD signal.

## Step 0 — Portfolio context (always first)

1. \`trGetPortfolioStatus\` — current value, P&L, invested capital
2. \`trGetCash\` — available cash
3. \`trGetWatchlist\` — instruments under consideration

## Step 1 — Data gathering (per instrument)

| Lens | Tools | Weight |
|---|---|---|
| Fundamentals | \`trGetStock\` | 30% |
| Technical | \`trGetTicker\` + \`trGetPerformance\` | 25% |
| Sentiment | \`trGetNews\` (read all articles, classify each) | 20% |
| Macro/Sector | \`trGetInstrument\` | 15% |
| Portfolio risk | portfolio + cash + watchlist (from Step 0) | 10% |

## Step 2 — Scoring rubric (1–5 per lens)

### Fundamentals (trGetStock)
- 5: analyst consensus ≥70% buy, strong growth, reasonable valuation
- 3: mixed signals / neutral
- 1: majority sell, deteriorating fundamentals

### Technical (trGetTicker + trGetPerformance)
- 5: price near 52w low with positive momentum, or breakout above range
- 3: mid-range, sideways
- 1: near 52w high with negative momentum, or breakdown

### Sentiment (trGetNews)
- Score: count positive/negative/neutral articles. Formula: (positive − negative) / total → map to 1–5
- 5: >60% positive; 3: balanced; 1: >60% negative

### Macro/Sector (trGetInstrument)
- 5: favored sector in current cycle, home-country tailwind
- 3: neutral sector
- 1: headwind sector, weak FX, regulatory risk

### Portfolio risk (position sizing)
- 5: instrument not yet held, <5% of portfolio, low correlation to existing positions
- 3: moderate overlap or concentration
- 1: already >10% of portfolio or highly correlated to top holding

## Step 3 — Final signal

weighted_score = (F×0.30 + T×0.25 + S×0.20 + M×0.15 + R×0.10)

| Score | Signal | Confidence |
|---|---|---|
| ≥4.0 | BUY | HIGH if ≥4.5, MEDIUM if 4.0–4.4 |
| 2.5–3.9 | HOLD | HIGH if 3.5–3.9, MEDIUM otherwise |
| <2.5 | SELL | HIGH if <2.0, MEDIUM otherwise |

Suggested max size: 10% of portfolio for HIGH confidence, 5% for MEDIUM, 0% for SELL.

## Step 4 — Backtest validation (when signal is BUY or SELL)

Run \`trBacktest\` with \`{ ticker, strategy, months: 12, commissionBps, slippageBps }\` where:
- strategy = 'sma' for trend-following instruments (ETFs, growth stocks)
- strategy = 'rsi' for mean-reverting instruments (dividend stocks, value plays)
- strategy = 'momentum' for high-momentum names

Note: ticker must be Yahoo Finance format (e.g. "ASML.AS" not ISIN). Get it from trGetInstrument shortName or trGetTicker.

If alpha_pct < 0: add a risk note that the strategy has not historically outperformed buy-and-hold on this name.
Treat every backtest as falsification evidence, not confirmation. State its cost assumptions and limitations.
Use the defaults (10 commission bps + 5 slippage bps per side) only when no broker-specific estimate is available.

## Step 5 — Output

Save to \`recommendations/<TICKER>_<DATE>.md\`:

\`\`\`
# <TICKER> — <COMPANY> — <DATE>

## Signal: BUY / SELL / HOLD (score: X.X/5 · confidence: HIGH/MEDIUM/LOW)
## Suggested position: X% of portfolio (≤ Y€)

## Lens scores
| Lens | Score | Key finding |
|---|---|---|
| Fundamentals (30%) | X/5 | ... |
| Technical (25%) | X/5 | ... |
| Sentiment (20%) | X/5 | ... |
| Macro/Sector (15%) | X/5 | ... |
| Portfolio risk (10%) | X/5 | ... |
| **Weighted total** | **X.X/5** | |

## Bull case
1. ...
2. ...

## Bear case
1. ...
2. ...

## Backtest (12m, <strategy>)
total return: X% | B&H: X% | alpha: X% | max drawdown: X% | Sharpe: X.X
assumptions: commission X bps/side | slippage X bps/side | fixed fees/taxes excluded

## Action required
What to do in Trade Republic app (manual). Always tell the user the exact ISIN.
\`\`\`

Then call \`inbox_push\` with:
- document: path to the recommendation file
- comment: one-sentence summary with the signal and ticker

## Hard constraints

- NEVER call order / payout / savings-plan tools — they do not exist here
- All TR data is read-only
- If uncertain on any lens: score 3 (neutral)
- HOLD is the default when data is insufficient
- Max position size: never suggest >10% of portfolio in one instrument
`)

writeFileSync(join(outDir, 'README.md'), `# Trading Multiagent Workspace

5-angle AI trading analysis: fundamentals + technical + sentiment + macro + risk.

## Usage

Ask the agent to analyze an instrument or your whole portfolio:

- "Analyze ASML for a potential entry"
- "Review my portfolio — which is the weakest holding?"
- "Compare NVDA vs AMD across all 5 lenses"
- "Run a full watchlist review"

Recommendations appear in the Inbox tab as scored, structured reports.
Results are also saved to \`recommendations/\` in this workspace.

## How it works

1. Agent reads TR portfolio + watchlist (context)
2. For each instrument: gathers data across 5 analytical lenses
3. Scores 1–5 per lens, computes weighted final score
4. Runs backtest to validate signal (trBacktest)
5. Pushes structured recommendation to Inbox

## Score interpretation

| Score | Signal |
|---|---|
| ≥4.0 | BUY |
| 2.5–3.9 | HOLD |
| <2.5 | SELL |
`)

console.log(\`bootstrapped trading-multiagent/\${tag} at \${outDir}\`)
