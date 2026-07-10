import { tool } from 'ai'
import { z } from 'zod'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PROBE = resolve(process.cwd(), 'scripts/analysis/backtest_probe.py')
const PYTR_LOCAL = process.env['PYTR_LOCAL'] ?? '/tmp/opencode/pytr-local'

function runBacktest(ticker: string, strategy: string, months: number, commissionBps: number, slippageBps: number): unknown {
  const pythonPath = [PYTR_LOCAL, process.env['PYTHONPATH'] ?? ''].filter(Boolean).join(':')
  const result = spawnSync('python3', [PROBE, ticker, strategy, String(months), String(commissionBps), String(slippageBps)], {
    env: { ...process.env, PYTHONPATH: pythonPath, PYTR_LOCAL },
    encoding: 'utf-8',
    timeout: 30_000,
  })
  if (result.error) throw new Error(`backtest spawn failed: ${result.error.message}`)
  if (result.status !== 0) {
    const raw = result.stdout?.trim() || result.stderr?.trim()
    let msg = `backtest exited ${result.status}`
    try { msg = JSON.parse(raw || '{}').error ?? msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const out = JSON.parse(result.stdout)
  if (!out.ok) throw new Error(out.error ?? 'unknown backtest error')
  return out.result
}

export function createAnalysisTools() {
  return {
    trBacktest: tool({
      description:
        'Run a simple backtest on a ticker using yfinance historical data. ' +
        'Returns net return, max drawdown, Sharpe ratio, win rate, and alpha vs buy-and-hold after estimated costs. ' +
        'Use it to challenge a trading hypothesis, never as an execution signal.',
      inputSchema: z.object({
        ticker: z.string().describe('Yahoo Finance ticker, e.g. "AAPL", "NVDA", "ASML.AS"'),
        strategy: z
          .enum(['sma', 'rsi', 'momentum'])
          .describe(
            'Strategy: sma = SMA 20/50 crossover (trend-following), ' +
            'rsi = RSI 30/70 mean reversion (contrarian), ' +
            'momentum = 20-day price momentum',
          ),
        months: z
          .number()
          .int()
          .min(3)
          .max(60)
          .default(12)
          .describe('Backtest period in months (3–60, default 12)'),
        commissionBps: z
          .number()
          .min(0)
          .max(500)
          .default(10)
          .describe('Estimated commission per side in basis points (default 10)'),
        slippageBps: z
          .number()
          .min(0)
          .max(500)
          .default(5)
          .describe('Estimated slippage per side in basis points (default 5)'),
      }),
      execute: async ({ ticker, strategy, months, commissionBps, slippageBps }) =>
        runBacktest(ticker, strategy, months, commissionBps, slippageBps),
    }),
  }
}
