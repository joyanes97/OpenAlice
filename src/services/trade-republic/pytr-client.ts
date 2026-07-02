import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const PROBE = process.env['TR_PROBE_SCRIPT']
  ?? resolve(process.cwd(), 'scripts/trade-republic/pytr_readonly_probe.py')

async function runProbe(command: string, vars?: Record<string, string>): Promise<unknown> {
  return new Promise((res, rej) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONPATH: process.env['PYTR_PYTHONPATH'] ?? '/tmp/opencode/pytr-local',
      PATH: `/tmp/opencode/pytr-local/bin:${process.env['PATH'] ?? ''}`,
      LD_LIBRARY_PATH: `/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu:${process.env['LD_LIBRARY_PATH'] ?? ''}`,
      ...vars,
    }
    const proc = spawn('python3', [PROBE, command], { env })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('error', rej)
    proc.on('close', (code) => {
      if (code !== 0) { rej(new Error(`pytr[${command}] exit ${code}: ${(err || out).trim()}`)); return }
      try {
        const parsed = JSON.parse(out) as { ok: boolean; result?: unknown; error?: string }
        if (!parsed.ok) rej(new Error(`pytr[${command}]: ${parsed.error ?? 'unknown error'}`))
        else res(parsed.result)
      } catch {
        rej(new Error(`pytr[${command}] invalid JSON: ${out.slice(0, 200)}`))
      }
    })
  })
}

export const trClient = {
  cash:            ()                               => runProbe('cash'),
  ticker:          (isin: string, exchange = 'LSX') => runProbe('ticker',      { TR_ISIN: isin, TR_EXCHANGE: exchange }),
  instrument:      (isin: string)                   => runProbe('instrument',  { TR_ISIN: isin }),
  stock:           (isin: string)                   => runProbe('stock',       { TR_ISIN: isin }),
  search:          (query: string)                  => runProbe('search',      { TR_QUERY: query }),
  news:            (isin: string)                   => runProbe('news',        { TR_ISIN: isin }),
  portfolioStatus: ()                               => runProbe('portfolio-status'),
  watchlist:       ()                               => runProbe('watchlist'),
  performance:     (isin: string, exchange = 'LSX') => runProbe('performance', { TR_ISIN: isin, TR_EXCHANGE: exchange }),
  searchTags:      ()                               => runProbe('search-tags'),
}
