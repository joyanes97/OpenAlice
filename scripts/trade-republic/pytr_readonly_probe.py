#!/usr/bin/env python3
"""Read-only Trade Republic probe via py-tr.

Usage:
  TR_PHONE='+34...' TR_PIN='1234' python scripts/trade-republic/pytr_readonly_probe.py cash
  TR_PHONE='+34...' TR_PIN='1234' python scripts/trade-republic/pytr_readonly_probe.py portfolio
  TR_PHONE='+34...' TR_PIN='1234' python scripts/trade-republic/pytr_readonly_probe.py timeline

Device reset, only when needed:
  TR_PHONE='+34...' TR_PIN='1234' python scripts/trade-republic/pytr_readonly_probe.py login

This script intentionally exposes no order/payout/savings-plan commands.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


READ_ONLY_COMMANDS = {
    "cash",
    "instrument",
    "news",
    "performance",
    "portfolio",
    "portfolio-status",
    "search",
    "search-tags",
    "stock",
    "ticker",
    "timeline",
    "watchlist",
}
AUTH_COMMANDS = {"login"}
LOCAL_COMMANDS = {"self-test"}


def die(message: str, code: int = 1) -> None:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(code)


def json_default(value: Any) -> str:
    return str(value)


def env_or_die(name: str) -> str:
    value = os.getenv(name)
    if not value:
        die(f"{name} is required")
    return value


def ensure_local_playwright_on_path() -> None:
    """Make pytr's subprocess.run(['playwright', ...]) work with --target installs."""
    paths = []
    for entry in sys.path:
        if not entry:
            continue
        candidate = Path(entry) / "bin"
        if (candidate / "playwright").exists():
            paths.append(str(candidate))
    if paths:
        current = os.environ.get("PATH", "")
        os.environ["PATH"] = os.pathsep.join([*paths, current])

    local_libs = Path("/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu")
    if local_libs.exists():
        current = os.environ.get("LD_LIBRARY_PATH", "")
        os.environ["LD_LIBRARY_PATH"] = os.pathsep.join([str(local_libs), current])


def main() -> None:
    if len(sys.argv) != 2:
        die(f"usage: {Path(sys.argv[0]).name} [{'|'.join(sorted(READ_ONLY_COMMANDS | AUTH_COMMANDS | LOCAL_COMMANDS))}]")

    command = sys.argv[1]
    if command not in READ_ONLY_COMMANDS | AUTH_COMMANDS | LOCAL_COMMANDS:
        die(f"unsupported command: {command}")

    phone = os.getenv("TR_PHONE")
    pin = os.getenv("TR_PIN")
    credentials_file = os.getenv("TR_CREDENTIALS_FILE", str(Path.home() / ".pytr" / "credentials"))
    cookies_file = os.getenv("TR_COOKIES_FILE", str(Path.home() / ".pytr" / "cookies"))
    try:
        # Current PyPI package is `pytr` and exposes pytr.api.TradeRepublicApi.
        # Some older docs/repositories refer to a `py_tr` package; keep a tiny
        # fallback so the probe still works if that variant is installed.
        from pytr.api import TradeRepublicApi  # type: ignore
    except Exception as exc:  # pragma: no cover - environment check
        try:
            from py_tr import TradeRepublicApi  # type: ignore
        except Exception:
            die(f"pytr is not installed or failed to import: {exc}")

    if command == "self-test":
        print(json.dumps({"ok": True, "command": command, "library": f"{TradeRepublicApi.__module__}.{TradeRepublicApi.__name__}"}, ensure_ascii=False))
        return

    ensure_local_playwright_on_path()

    if not phone or not pin:
        die("TR_PHONE and TR_PIN are required")

    Path(credentials_file).parent.mkdir(parents=True, exist_ok=True)
    Path(cookies_file).parent.mkdir(parents=True, exist_ok=True)

    try:
        tr = TradeRepublicApi(
            phone_no=phone,
            pin=pin,
            save_cookies=True,
            credentials_file=credentials_file,
            cookies_file=cookies_file,
        )
    except TypeError:
        # Older `py_tr` API.
        tr = TradeRepublicApi(phone_no=phone, pin=pin, keyfile=os.getenv("TR_KEYFILE", str(Path.home() / ".pytr" / "keyfile.pem")))

    def ensure_login() -> None:
        if hasattr(tr, "resume_websession") and tr.resume_websession():
            return
        if hasattr(tr, "initiate_weblogin"):
            countdown = tr.initiate_weblogin()
            code = os.getenv("TR_2FA")
            if not code:
                if sys.stdin.isatty():
                    print(f"Enter Trade Republic 2FA code. Countdown: {countdown}s", file=sys.stderr)
                    code = input("TR_2FA: ").strip()
                else:
                    die("TR_2FA is required for first login; rerun with TR_2FA=<code>")
            tr.complete_weblogin(code)
            return
        if hasattr(tr, "login"):
            tr.login()
            return
        die("installed Trade Republic library has no supported login flow")

    if command == "login":
        ensure_login()
        result = {"loggedIn": True, "cookiesFile": cookies_file}
    elif command == "cash":
        ensure_login()
        result = tr.run_blocking(tr.cash(), timeout=10) if hasattr(tr, "run_blocking") else tr.blocking_cash(timeout=10)
    elif command == "ticker":
        ensure_login()
        result = tr.run_blocking(tr.ticker(env_or_die("TR_ISIN"), os.getenv("TR_EXCHANGE", "LSX")), timeout=10)
    elif command == "instrument":
        ensure_login()
        result = tr.run_blocking(tr.instrument_details(env_or_die("TR_ISIN")), timeout=10)
    elif command == "stock":
        ensure_login()
        result = tr.run_blocking(tr.stock_details(env_or_die("TR_ISIN")), timeout=10)
    elif command == "search":
        ensure_login()
        result = tr.run_blocking(tr.search(env_or_die("TR_QUERY")), timeout=10)
    elif command == "news":
        ensure_login()
        result = tr.run_blocking(tr.news(env_or_die("TR_ISIN")), timeout=10)
    elif command == "portfolio-status":
        ensure_login()
        result = tr.run_blocking(tr.portfolio_status(), timeout=10)
    elif command == "watchlist":
        ensure_login()
        result = tr.run_blocking(tr.watchlist(), timeout=10)
    elif command == "performance":
        ensure_login()
        result = tr.run_blocking(tr.performance(env_or_die("TR_ISIN"), os.getenv("TR_EXCHANGE", "LSX")), timeout=10)
    elif command == "search-tags":
        ensure_login()
        result = tr.run_blocking(tr.search_tags(), timeout=10)
    elif command == "portfolio":
        ensure_login()
        if hasattr(tr, "compact_portfolio"):
            result = tr.run_blocking(tr.compact_portfolio(), timeout=10)
        else:
            result = tr.blocking_portfolio(timeout=10)
    elif command == "timeline":
        ensure_login()
        result = tr.run_blocking(tr.timeline(), timeout=10) if hasattr(tr, "run_blocking") else tr.blocking_timeline(timeout=10)
    else:
        die(f"unsupported command: {command}")

    print(json.dumps({"ok": True, "command": command, "result": result}, default=json_default, ensure_ascii=False))


if __name__ == "__main__":
    main()
