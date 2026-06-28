#!/usr/bin/env python3
"""Deploy CashbackBrain stack to a Dokploy environment (development or production).

Usage:
  python3 scripts/deploy_environment_dokploy.py development
  python3 scripts/deploy_environment_dokploy.py production
  python3 scripts/deploy_environment_dokploy.py dev --services pocketbase,fastapi,frontend

Requires .env.dokploy (DOKPLOY_URL, DOKPLOY_API_KEY) plus backend/.env for FastAPI secrets.

Profiles (see scripts/dokploy_common.py):
  development → branch dev,  dev.cashbackbrain.ru / api-dev / pb-dev
  production  → branch main, cashbackbrain.ru / api / pb
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deploy_fastapi_dokploy import deploy_fastapi
from deploy_frontend_dokploy import deploy_frontend
from deploy_pocketbase_dokploy import deploy_pocketbase
from dokploy_common import (
    DokployClient,
    apply_deploy_profile,
    load_dokploy_env,
    normalize_deploy_target,
    require_env,
)

ALL_SERVICES = ("pocketbase", "fastapi", "frontend")


def parse_services(raw: str) -> tuple[str, ...]:
    names = tuple(part.strip().lower() for part in raw.split(",") if part.strip())
    unknown = [name for name in names if name not in ALL_SERVICES]
    if unknown:
        raise SystemExit(f"Unknown services: {', '.join(unknown)}. Use: {', '.join(ALL_SERVICES)}")
    return names or ALL_SERVICES


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy CashbackBrain stack to Dokploy")
    parser.add_argument(
        "target",
        nargs="?",
        default=os.environ.get("DOKPLOY_TARGET", "development"),
        help="development (dev) or production (prod)",
    )
    parser.add_argument(
        "--services",
        default=os.environ.get("DOKPLOY_SERVICES", ",".join(ALL_SERVICES)),
        help="Comma-separated: pocketbase,fastapi,frontend",
    )
    parser.add_argument(
        "--skip-git-push",
        action="store_true",
        help="Do not push Git branch before deploy",
    )
    args = parser.parse_args()

    target = normalize_deploy_target(args.target)
    services = parse_services(args.services)

    load_dokploy_env()
    profile = apply_deploy_profile(target)
    os.environ["DOKPLOY_TARGET"] = target

    if args.skip_git_push:
        os.environ["POCKETBASE_SKIP_GIT_PUSH"] = "1"
        os.environ["FASTAPI_SKIP_GIT_PUSH"] = "1"
        os.environ["FRONTEND_SKIP_GIT_PUSH"] = "1"

    client = DokployClient(require_env("DOKPLOY_URL"), require_env("DOKPLOY_API_KEY"))

    print(f"Deploying to {target}: {', '.join(services)}")
    print()

    results: dict[str, str] = {}

    if "pocketbase" in services:
        print("=== PocketBase ===")
        results["pocketbase"] = deploy_pocketbase(client)
        print()

    if "fastapi" in services:
        print("=== FastAPI ===")
        from deploy_fastapi_dokploy import load_backend_env

        load_backend_env()
        results["fastapi"] = deploy_fastapi(client)
        print()

    if "frontend" in services:
        print("=== Frontend ===")
        results["frontend"] = deploy_frontend(client)
        print()

    print("Done.")
    print(f"  Target:   {target}")
    print(f"  Branch:   {profile['GITHUB_BRANCH']}")
    print(f"  Frontend: https://{profile['FRONTEND_DOMAIN']}")
    print(f"  API:      https://{profile['FASTAPI_DOMAIN']}")
    print(f"  PocketBase: https://{profile['POCKETBASE_DOMAIN']}")
    for name, app_id in results.items():
        print(f"  {name} appId: {app_id}")

    if target == "development":
        print()
        print("After first PocketBase deploy:")
        print("  1. Create superadmin at https://pb-dev.cashbackbrain.ru/_/")
        print("  2. POCKETBASE_URL=https://pb-dev.cashbackbrain.ru python3 scripts/setup_pocketbase.py")
        print("  3. FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py")


if __name__ == "__main__":
    main()
