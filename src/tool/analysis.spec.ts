import { describe, expect, it } from 'vitest'
import { createAnalysisTools } from './analysis.js'

describe('trCreateProposal', () => {
  it('downgrades unsupported BUY proposals and never permits execution', async () => {
    const tools = createAnalysisTools()
    const result = await tools.trCreateProposal.execute!({
      ticker: 'AAPL',
      lenses: { fundamentals: 5, technical: 4, sentiment: 4, macroSector: 4, portfolioRisk: 4 },
      requestedPositionPct: 10,
      backtest: {
        strategy: 'sma',
        alphaPct: -1,
        maxDrawdownPct: -12,
        sharpeRatio: .4,
        commissionBps: 10,
        slippageBps: 5,
      },
    }, { toolCallId: 't', messages: [] })

    expect(result).toMatchObject({
      ticker: 'AAPL',
      signal: 'HOLD',
      approvedPositionPct: 0,
      reviewRequired: true,
      executionPermitted: false,
    })
  })
})
