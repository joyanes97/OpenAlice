#!/usr/bin/env python3
"""
Lightweight backtesting probe — jose_aibroker
Strategies: sma (SMA 20/50 crossover), rsi (RSI 30/70), momentum (20d)
Usage: python backtest_probe.py <ticker> <strategy> <months>
Output: JSON {ok, result: {ticker, strategy, period_months, metrics, equity_curve}}
"""
import sys, json, math, os

def _setup_path():
    pytr_local = os.environ.get('PYTR_LOCAL', '/tmp/opencode/pytr-local')
    if os.path.isdir(pytr_local) and pytr_local not in sys.path:
        sys.path.insert(0, pytr_local)

_setup_path()

def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(1)

def main():
    if len(sys.argv) < 4:
        fail("usage: backtest_probe.py <ticker> <strategy> <months>")

    ticker   = sys.argv[1].upper()
    strategy = sys.argv[2].lower()
    try:
        months = int(sys.argv[3])
    except ValueError:
        fail("months must be an integer")

    if strategy not in ('sma', 'rsi', 'momentum'):
        fail(f"unknown strategy '{strategy}'. Use: sma, rsi, momentum")

    try:
        import yfinance as yf
    except ImportError:
        fail("yfinance not installed. Run: pip install yfinance")

    try:
        import pandas as pd
    except ImportError:
        fail("pandas not installed")

    from datetime import datetime, timedelta
    end   = datetime.now()
    start = end - timedelta(days=months * 30)

    raw = yf.download(ticker, start=start.strftime('%Y-%m-%d'),
                      end=end.strftime('%Y-%m-%d'), progress=False, auto_adjust=True)
    if raw is None or raw.empty:
        fail(f"no price data for {ticker}")

    # yfinance ≥0.2 may return MultiIndex columns — flatten
    if hasattr(raw.columns, 'levels'):
        raw.columns = [c[0] if isinstance(c, tuple) else c for c in raw.columns]

    df = raw[['Close']].copy()
    df.columns = ['close']
    df = df.dropna()

    if len(df) < 60:
        fail(f"not enough data for {ticker} (got {len(df)} bars, need ≥60)")

    # ── Signals ────────────────────────────────────────────────────────────
    if strategy == 'sma':
        df['fast'] = df['close'].rolling(20).mean()
        df['slow'] = df['close'].rolling(50).mean()
        df['signal'] = 0
        df.loc[df['fast'] > df['slow'], 'signal'] = 1
        df.loc[df['fast'] < df['slow'], 'signal'] = -1

    elif strategy == 'rsi':
        delta = df['close'].diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain / loss.replace(0, float('nan'))
        df['rsi'] = 100 - (100 / (1 + rs))
        df['signal'] = 0
        df.loc[df['rsi'] < 30, 'signal'] =  1   # oversold → long
        df.loc[df['rsi'] > 70, 'signal'] = -1   # overbought → flat

    elif strategy == 'momentum':
        df['ret20'] = df['close'].pct_change(20)
        df['signal'] = 0
        df.loc[df['ret20'] >  0.05, 'signal'] =  1
        df.loc[df['ret20'] < -0.05, 'signal'] = -1

    # ── Simulation (long-only, fully-invested when signal=1) ───────────────
    df['position']    = df['signal'].shift(1).fillna(0).clip(lower=0)
    df['daily_ret']   = df['close'].pct_change()
    df['strategy_ret']= df['position'] * df['daily_ret']
    df['equity']      = (1 + df['strategy_ret']).cumprod()
    df = df.dropna(subset=['equity'])

    # ── Metrics ────────────────────────────────────────────────────────────
    equity       = df['equity']
    total_return = float(equity.iloc[-1] - 1)
    n_years      = max(months / 12, 0.1)
    annualized   = float((1 + total_return) ** (1 / n_years) - 1)

    rolling_max  = equity.cummax()
    drawdown     = (equity - rolling_max) / rolling_max
    max_drawdown = float(drawdown.min())

    sr = df['strategy_ret'].dropna()
    sharpe = float(sr.mean() / sr.std() * math.sqrt(252)) if sr.std() > 0 else 0.0

    in_pos   = df.loc[df['position'] > 0, 'strategy_ret'].dropna()
    win_rate = float((in_pos > 0).sum() / max(len(in_pos), 1))

    bh_return = float(df['close'].iloc[-1] / df['close'].iloc[0] - 1)
    n_trades  = int((df['position'].diff().fillna(0) != 0).sum())

    # ── Equity curve (sampled to ≤100 points) ──────────────────────────────
    eq = df[['equity']].reset_index()
    eq.columns = ['date', 'value']
    step    = max(1, len(eq) // 100)
    sampled = eq.iloc[::step].copy()
    sampled['date'] = sampled['date'].dt.strftime('%Y-%m-%d')
    sampled['value']= sampled['value'].round(4)
    equity_curve = sampled.to_dict('records')

    result = {
        "ticker": ticker,
        "strategy": strategy,
        "period_months": months,
        "metrics": {
            "total_return_pct":     round(total_return  * 100, 2),
            "annualized_return_pct":round(annualized    * 100, 2),
            "max_drawdown_pct":     round(max_drawdown  * 100, 2),
            "sharpe_ratio":         round(sharpe,              2),
            "win_rate_pct":         round(win_rate       * 100, 2),
            "buy_and_hold_pct":     round(bh_return     * 100, 2),
            "alpha_pct":            round((total_return - bh_return) * 100, 2),
            "n_trades":             n_trades,
        },
        "equity_curve": equity_curve,
    }
    print(json.dumps({"ok": True, "result": result}))

if __name__ == '__main__':
    main()
