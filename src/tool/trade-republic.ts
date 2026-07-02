import { tool } from 'ai'
import { z } from 'zod'
import { trClient } from '@/services/trade-republic/pytr-client.js'

export function createTradeRepublicTools() {
  return {
    trGetCash: tool({
      description: 'Get Trade Republic cash balance. Returns available EUR cash and account number.',
      inputSchema: z.object({}),
      execute: async () => trClient.cash(),
    }),

    trSearchInstruments: tool({
      description: 'Search Trade Republic instruments by name or ticker. Use this first to find an ISIN before calling other TR tools.',
      inputSchema: z.object({
        query: z.string().describe('Search term, e.g. "Apple", "NVDA", "MSCI World"'),
      }),
      execute: async ({ query }) => trClient.search(query),
    }),

    trGetTicker: tool({
      description: 'Get real-time bid/ask price and last trade for a Trade Republic instrument.',
      inputSchema: z.object({
        isin: z.string().describe('ISIN, e.g. "US0378331005" for Apple'),
        exchange: z.string().optional().describe('Exchange code (default: LSX = Lang & Schwarz)'),
      }),
      execute: async ({ isin, exchange }) => trClient.ticker(isin, exchange),
    }),

    trGetInstrument: tool({
      description: 'Get instrument metadata from Trade Republic: name, asset type, sector, country, tags, trading hours.',
      inputSchema: z.object({
        isin: z.string().describe('ISIN code'),
      }),
      execute: async ({ isin }) => trClient.instrument(isin),
    }),

    trGetStock: tool({
      description: 'Get detailed stock info from Trade Republic: company description, key metrics, analyst ratings, dividends.',
      inputSchema: z.object({
        isin: z.string().describe('ISIN code'),
      }),
      execute: async ({ isin }) => trClient.stock(isin),
    }),

    trGetNews: tool({
      description: 'Get recent news articles for an instrument from Trade Republic.',
      inputSchema: z.object({
        isin: z.string().describe('ISIN code'),
      }),
      execute: async ({ isin }) => trClient.news(isin),
    }),

    trGetPortfolioStatus: tool({
      description: 'Get Trade Republic portfolio summary: total invested, current value, overall P&L across all positions.',
      inputSchema: z.object({}),
      execute: async () => trClient.portfolioStatus(),
    }),

    trGetWatchlist: tool({
      description: 'Get the Trade Republic watchlist — all instruments the user is monitoring.',
      inputSchema: z.object({}),
      execute: async () => trClient.watchlist(),
    }),

    trGetPerformance: tool({
      description: 'Get price performance history (chart data) for a Trade Republic instrument.',
      inputSchema: z.object({
        isin: z.string().describe('ISIN code'),
        exchange: z.string().optional().describe('Exchange code (default: LSX)'),
      }),
      execute: async ({ isin, exchange }) => trClient.performance(isin, exchange),
    }),
  }
}
