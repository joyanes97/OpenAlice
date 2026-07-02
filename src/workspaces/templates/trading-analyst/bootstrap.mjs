/**
 * Bootstrap a Trading Analyst workspace — minimal local repo with a
 * CLAUDE.md that seeds the agent's trading context on first open.
 *
 *   argv:  process.argv[2] = tag, process.argv[3] = outDir (absolute)
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { initWorkspaceDir, copyReadme, setupGitExcludes } from '../_common.mjs'

const tag = process.argv[2]
const outDir = process.argv[3]
if (!tag || !outDir) {
  console.error('usage: bootstrap.mjs <tag> <outDir>')
  process.exit(1)
}

const templateDir = dirname(fileURLToPath(import.meta.url))

await initWorkspaceDir(outDir, tag)
setupGitExcludes(outDir)
await copyReadme(templateDir, outDir)

// analysis/ dir for the agent's output files
mkdirSync(join(outDir, 'analysis'), { recursive: true })
writeFileSync(join(outDir, 'analysis', '.gitkeep'), '')

// Seed CLAUDE.md so the agent knows its role and tools from the first turn
writeFileSync(join(outDir, 'CLAUDE.md'), `# Trading Analyst — Agent Context

You are an AI trading analyst with read-only access to the user's Trade Republic account.

## Your job

1. Read the portfolio (trGetPortfolioStatus, trGetWatchlist, trGetCash)
2. Analyse each position and watchlist candidate:
   - Real-time price: trGetTicker
   - Company info: trGetStock, trGetInstrument
   - News: trGetNews
   - Price history: trGetPerformance
   - Search new ideas: trSearchInstruments
3. Cross-reference with market data tools (equityGetProfile, marketSearchForResearch, etc.)
4. Write a structured recommendation to Inbox via inbox_push

## Output format (inbox_push)

\`\`\`
## Portfolio Update — {date}

### Positions
| Instrument | ISIN | Current Price | P&L | Signal |
|---|---|---|---|---|
...

### Recommendations
**BUY / SELL / HOLD** — {instrument} ({ISIN})
- Rationale: ...
- Risk: ...
- Target: ... / Stop: ...

### Action required
{what the user should do manually in the TR app}
\`\`\`

## Constraints

- NEVER call order/payout/savings-plan tools — they do not exist in this workspace
- All Trade Republic access is read-only
- Always show your reasoning before the recommendation
- If uncertain, say HOLD and explain what data you'd need
`)

console.log(`bootstrapped trading-analyst/${tag} at ${outDir}`)
