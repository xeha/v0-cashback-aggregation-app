#!/usr/bin/env python3
"""Post-deploy setup for development environment: PocketBase superuser, catalog, verify.

Run after deploy_environment_dokploy.py development when builds finished.

Usage:
  set -a && source .env.dokploy && source .env.pocketbase && set +a
  python3 scripts/setup_dev_post_deploy.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from dokploy_common import load_dokploy_env, require_env

DEV_ENV_ID = os.environ.get("DOKPLOY_DEV_ENVIRONMENT_ID", "PBM-xAngzTQwyL8_8rxQi")
DEV_PB_APP_ID = os.environ.get("DEV_POCKETBASE_APP_ID", "TJLMTHwQTtE8Qw9jzsehJ")
DEV_PB_DOMAIN = "pb-dev.cashbackbrain.ru"
DEV_API = "https://api-dev.cashbackbrain.ru"
DEV_FE = "https://dev.cashbackbrain.ru"
DEV_PB = f"https://{DEV_PB_DOMAIN}"
CURL_TIMEOUT = int(os.environ.get("DEV_SETUP_CURL_TIMEOUT", "90"))


def curl_ok(url: str, *, expect: str | None = None) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=CURL_TIMEOUT) as resp:
            body = resp.read(8000).decode("utf-8", errors="replace")
            if expect and expect not in body:
                return False
            return 200 <= resp.status < 300
    except Exception as exc:
        print(f"  ~ {url}: {exc}")
        return False


def wait_for(label: str, url: str, *, expect: str | None = None, attempts: int = 30) -> None:
    print(f"Waiting for {label} ({url})…")
    for i in range(1, attempts + 1):
        if curl_ok(url, expect=expect):
            print(f"  ✓ {label} ready")
            return
        print(f"  attempt {i}/{attempts}")
        time.sleep(20)
    raise SystemExit(f"Timeout waiting for {label}: {url}")


def main() -> int:
    load_dokploy_env()

    wait_for("PocketBase", f"{DEV_PB}/api/health", expect="healthy")
    wait_for("FastAPI", f"{DEV_API}/health", expect="ok")

    env = os.environ.copy()
    env.update(
        {
            "POCKETBASE_APP_ID": DEV_PB_APP_ID,
            "DOKPLOY_ENVIRONMENT_ID": DEV_ENV_ID,
            "POCKETBASE_DOMAIN": DEV_PB_DOMAIN,
            "POCKETBASE_VOLUME": "pocketbase_pb_data_dev",
            "POCKETBASE_IMPORT_CATALOG": "1",
            "POCKETBASE_SSL_VERIFY": "false",
            "POCKETBASE_URL": DEV_PB,
        }
    )

    print("PocketBase superuser + catalog import…")
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "create_pocketbase_superuser.py")],
        env=env,
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        return result.returncode

    env_phase1 = env.copy()
    env_phase1.update(
        {
            "POCKETBASE_APP_ID": DEV_PB_APP_ID,
            "POCKETBASE_DOMAIN": DEV_PB_DOMAIN,
            "POCKETBASE_CORS_ORIGINS": (
                f"{DEV_FE},http://localhost:3000,{DEV_PB}"
            ),
        }
    )
    print("PocketBase phase 1 (settings, auth, CORS)…")
    # phase1 script uses hardcoded APP_URL — pass via env for patch_settings if extended later
    subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "setup_pocketbase_phase1.py")],
        env=env_phase1,
        cwd=REPO_ROOT,
        check=False,
    )

    print("Waiting for frontend build…")
    wait_for("Frontend", f"{DEV_FE}/", expect="CashbackBrain")

    print("E2E verify…")
    verify_env = os.environ.copy()
    verify_env.update(
        {
            "FRONTEND_URL": DEV_FE,
            "E2E_API_URL": DEV_API,
            "E2E_POCKETBASE_URL": DEV_PB,
        }
    )
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "verify_e2e_phase5.py")],
        env=verify_env,
        cwd=REPO_ROOT,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
