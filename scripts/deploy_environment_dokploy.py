#!/usr/bin/env python3
"""Deploy CashbackBrain stack to a Dokploy environment (development or production).

Usage:
  python3 scripts/deploy_environment_dokploy.py development
  python3 scripts/deploy_environment_dokploy.py production
  python3 scripts/deploy_environment_dokploy.py dev --services pocketbase,fastapi,frontend
  python3 scripts/deploy_environment_dokploy.py dev --base-ref HEAD~3

By default, services are auto-detected from changed files via git diff against
origin/<branch>. Pass --services to override.

Requires .env.dokploy (DOKPLOY_URL, DOKPLOY_API_KEY) plus backend/.env for FastAPI secrets.

Profiles (see scripts/dokploy_common.py):
  development → branch dev,  dev.cashbackbrain.ru / api-dev / pb-dev
  production  → branch main, cashbackbrain.ru / api / pb
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deploy_fastapi_dokploy import deploy_fastapi
from deploy_frontend_dokploy import deploy_frontend
from deploy_pocketbase_dokploy import deploy_pocketbase
from dokploy_common import (
    REPO_ROOT,
    DokployClient,
    apply_deploy_profile,
    load_dokploy_env,
    normalize_deploy_target,
    require_env,
)

ALL_SERVICES = ("pocketbase", "fastapi", "frontend")

# Files/dirs that trigger each service rebuild.
# First matching prefix wins; unmatched files are ignored (e.g. docs, scripts).
_SERVICE_PATTERNS: dict[str, tuple[str, ...]] = {
    "frontend": (
        "app/",
        "components/",
        "lib/",
        "public/",
        "e2e/",
        "tests/",
        "next.config.",
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "tsconfig",
        "postcss.config",
        "tailwind",
        "next-env.d.ts",
        ".env.example",
    ),
    "fastapi": (
        "backend/",
    ),
    "pocketbase": (
        "pocketbase/",
    ),
}


def detect_changed_services(base_ref: str) -> tuple[str, ...]:
    """Return services whose source files changed between base_ref and HEAD."""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", f"{base_ref}...HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=REPO_ROOT,
        )
        changed = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except subprocess.CalledProcessError as exc:
        print(f"git diff failed ({exc}), falling back to full deploy")
        return ALL_SERVICES

    if not changed:
        print("No changed files detected — nothing to deploy.")
        return ()

    hit: set[str] = set()
    for path in changed:
        for service, patterns in _SERVICE_PATTERNS.items():
            if any(path.startswith(p) or path == p.rstrip("/") for p in patterns):
                hit.add(service)
                break

    # Preserve canonical order
    return tuple(s for s in ALL_SERVICES if s in hit)


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
        default=None,
        help=(
            "Comma-separated: pocketbase,fastapi,frontend. "
            "Omit to auto-detect from git diff (default)."
        ),
    )
    parser.add_argument(
        "--base-ref",
        default=None,
        help="Git ref to diff against for auto-detection (default: origin/<branch>).",
    )
    parser.add_argument(
        "--skip-git-push",
        action="store_true",
        help="Do not push Git branch before deploy",
    )
    args = parser.parse_args()

    target = normalize_deploy_target(args.target)
    load_dokploy_env()
    profile = apply_deploy_profile(target)
    os.environ["DOKPLOY_TARGET"] = target

    # Resolve which services to deploy
    explicit_services = args.services or os.environ.get("DOKPLOY_SERVICES", "").strip()
    if explicit_services:
        services = parse_services(explicit_services)
        print(f"Services (explicit): {', '.join(services)}")
    else:
        branch = profile["GITHUB_BRANCH"]
        base_ref = args.base_ref or f"origin/{branch}"
        print(f"Auto-detecting changed services (diff against {base_ref})…")
        services = detect_changed_services(base_ref)
        if not services:
            print("Nothing to deploy. Use --services to force.")
            return
        print(f"Services (auto): {', '.join(services)}")

    if args.skip_git_push:
        os.environ["POCKETBASE_SKIP_GIT_PUSH"] = "1"
        os.environ["FASTAPI_SKIP_GIT_PUSH"] = "1"
        os.environ["FRONTEND_SKIP_GIT_PUSH"] = "1"

    client = DokployClient(require_env("DOKPLOY_URL"), require_env("DOKPLOY_API_KEY"))

    print(f"\nDeploying to {target}: {', '.join(services)}")
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
        print("Development deploy finished.")
        print("  Stop dev stack when not testing (saves RAM on VPS):")
        print("    python3 scripts/toggle_dev_stack.py stop")
        print("  Before next test:")
        print("    python3 scripts/toggle_dev_stack.py start --wait-health")
        if os.environ.get("DEV_STACK_AUTO_STOP", "").strip().lower() in ("1", "true", "yes"):
            print()
            print("DEV_STACK_AUTO_STOP=1 — stopping development stack…")
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve().parent / "toggle_dev_stack.py"), "stop"],
                check=False,
            )
        print()
        print("After first PocketBase deploy:")
        print("  1. Create superadmin at https://pb-dev.cashbackbrain.ru/_/")
        print("  2. POCKETBASE_URL=https://pb-dev.cashbackbrain.ru python3 scripts/setup_pocketbase.py")
        print("  3. FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py")


if __name__ == "__main__":
    main()
