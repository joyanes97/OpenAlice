import { tool } from 'ai'
import { z } from 'zod'
import { spawnSync } from 'child_process'
import { resolve } from 'path'
import type { BarService } from '@/domain/market-data/bars/index'
import { IndicatorCalculator } from '@/domain/analysis/indicator/calculator'
import type { IndicatorContext, HistoricalDataResult } from '@/domain/analysis/indicator/types'

const PROBE = resolve(process.cwd(), 'scripts/analysis/backtest_probe.py')
const PYTR_LOCAL = process.env['PYTR_LOCAL'] ?? '/tmp/opencode/pytr-local'
const score = z.number().min(1).max(5)

function buildContext(
  asset: 'equity' | 'crypto' | 'currency' | 'commodity',
  barService: BarService,
): IndicatorContext {
  return {
    getHistoricalData: async (symbol, interval): Promise<HistoricalDataResult> => {
      const { bars, meta } = await barService.getBars({ symbol, assetClass: asset }, { interval })
      return { data: bars, meta }
    },
  }
}

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

export function createAnalysisTools(barService: BarService) {
  return {
    calculateIndicator: tool({
      description: 'Legacy indicator calculator over vendor-default bars. Prefer calculateQuant for broker-keyed, time-sensitive analysis.',
      inputSchema: z.object({
        asset: z.enum(['equity', 'crypto', 'currency', 'commodity']),
        formula: z.string(),
        precision: z.number().int().min(0).max(10).optional(),
      }),
      execute: async ({ asset, formula, precision }) => {
        const calculator = new IndicatorCalculator(buildContext(asset, barService))
        return await calculator.calculate(formula, precision)
      },
    }),
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
    trCreateProposal: tool({
      description:
        'Create a canonical, read-only trading research proposal from five scored lenses and optional backtest metrics. ' +
        'It never stages, commits, or sends an order. BUY requires non-negative backtest alpha; position sizing is capped at 10%.',
      inputSchema: z.object({
        ticker: z.string().regex(/^[A-Za-z0-9.^=-]{1,20}$/, 'invalid Yahoo Finance ticker'),
        lenses: z.object({
          fundamentals: score,
          technical: score,
          sentiment: score,
          macroSector: score,
          portfolioRisk: score,
        }),
        requestedPositionPct: z.number().min(0).max(10),
        backtest: z.object({
          strategy: z.enum(['sma', 'rsi', 'momentum']),
          alphaPct: z.number(),
          maxDrawdownPct: z.number().max(0),
          sharpeRatio: z.number(),
          commissionBps: z.number().min(0).max(500),
          slippageBps: z.number().min(0).max(500),
        }).optional(),
      }),
      execute: async ({ ticker, lenses, requestedPositionPct, backtest }) => {
        const weightedScore =
          lenses.fundamentals * .30 +
          lenses.technical * .25 +
          lenses.sentiment * .20 +
          lenses.macroSector * .15 +
          lenses.portfolioRisk * .10
        const roundedScore = Number(weightedScore.toFixed(2))
        const baseSignal = roundedScore >= 4 ? 'BUY' : roundedScore < 2.5 ? 'SELL' : 'HOLD'
        const signal = baseSignal === 'BUY' && (!backtest || backtest.alphaPct < 0) ? 'HOLD' : baseSignal
        const confidence = roundedScore >= 4.5 ? 'HIGH' : roundedScore >= 3.5 ? 'MEDIUM' : 'LOW'
        return {
          ticker: ticker.toUpperCase(),
          signal,
          confidence,
          weightedScore: roundedScore,
          requestedPositionPct,
          approvedPositionPct: signal === 'BUY' ? requestedPositionPct : 0,
          lenses,
          ...(backtest ? { backtest } : {}),
          reviewRequired: true,
          executionPermitted: false,
          warnings: [
            ...(baseSignal === 'BUY' && signal !== 'BUY' ? ['BUY downgraded to HOLD: backtest alpha is missing or negative.'] : []),
            'Research proposal only. Broker execution remains a separate UTA approval flow.',
          ],
        }
      },
    }),
  }
}
