#!/usr/bin/env python3
"""Verify FastAPI Phase 3 production config: S3 catalogs, PocketBase retailer_catalog, optional /health.

Reads env from (first wins for each key):
  - process environment
  - backend/.env
  - .env.pocketbase (POCKETBASE_* only)

Usage:
  python3 scripts/setup_backend_phase3.py
  python3 scripts/setup_backend_phase3.py --health   # start uvicorn, curl /health, stop
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"
DEFAULT_ASSETS_URL = "https://fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru"
EXPECTED_CATALOG_RECORDS = 146


def _load_env_file(path: Path, *, keys_only: set[str] | None = None, override: bool = False) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if keys_only is not None and key not in keys_only:
            continue
        if not override and key in os.environ:
            continue
        cleaned = value.strip().strip('"')
        os.environ[key] = cleaned.strip("'")


def _load_env() -> None:
    _load_env_file(BACKEND_ROOT / ".env")
    _load_env_file(
        REPO_ROOT / ".env.pocketbase",
        keys_only={
            "POCKETBASE_URL",
            "POCKETBASE_ADMIN_EMAIL",
            "POCKETBASE_ADMIN_PASSWORD",
            "POCKETBASE_SSL_VERIFY",
        },
        override=True,
    )


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing env var: {name}")
    return value


def verify_assets_url() -> None:
    assets_url = os.environ.get("ASSETS_URL", DEFAULT_ASSETS_URL).rstrip("/")
    os.environ.setdefault("ASSETS_URL", assets_url)
    url = f"{assets_url}/catalogs/bank_category_catalog.json"
    with httpx.Client(timeout=30.0) as client:
        response = client.get(url)
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("bank_category_catalog.json is not a JSON object")
    print(f"  ✓ S3 catalogs: {url} ({len(payload)} top-level keys)")


def _pb_superuser_token(client: httpx.Client, base_url: str) -> str:
    email = _require("POCKETBASE_ADMIN_EMAIL")
    password = _require("POCKETBASE_ADMIN_PASSWORD")
    response = client.post(
        f"{base_url}/api/collections/_superusers/auth-with-password",
        json={"identity": email, "password": password},
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("PocketBase superuser auth succeeded without token")
    return str(token)


def verify_pocketbase() -> int:
    base_url = os.environ.get("POCKETBASE_URL", "https://pb.cashbackbrain.ru").rstrip("/")
    verify_ssl = os.environ.get("POCKETBASE_SSL_VERIFY", "true").lower() not in ("0", "false", "no")

    with httpx.Client(timeout=30.0, verify=verify_ssl) as client:
        response = client.get(
            f"{base_url}/api/collections/retailer_catalog/records",
            params={"page": 1, "perPage": 1},
        )
        response.raise_for_status()
        total = int(response.json().get("totalItems", 0))

    print(f"  ✓ PocketBase retailer_catalog: {total} records @ {base_url}")
    if total < EXPECTED_CATALOG_RECORDS:
        raise RuntimeError(
            f"Expected at least {EXPECTED_CATALOG_RECORDS} retailer_catalog records, got {total}"
        )

    email = os.environ.get("POCKETBASE_ADMIN_EMAIL", "").strip()
    password = os.environ.get("POCKETBASE_ADMIN_PASSWORD", "").strip()
    if email and password:
        with httpx.Client(timeout=30.0, verify=verify_ssl) as client:
            try:
                _pb_superuser_token(client, base_url)
                print("  ✓ PocketBase superuser auth OK")
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:200]
                print(f"  ⚠ PocketBase superuser auth failed ({exc.response.status_code}): {detail}")
                print("    (reads work; writes to retailer_catalog need valid superuser creds)")
    else:
        print("  ⚠ POCKETBASE_ADMIN_* not set — skipping superuser auth check")

    return total


def verify_optional_keys() -> None:
    if not os.environ.get("MISTRAL_API_KEY", "").strip():
        print("  ⚠ MISTRAL_API_KEY not set (OCR will fail until configured)")
    else:
        print("  ✓ MISTRAL_API_KEY set")

    if not os.environ.get("ADMIN_KEY", "").strip():
        print("  ⚠ ADMIN_KEY not set — generate: openssl rand -hex 16")
    else:
        print("  ✓ ADMIN_KEY set")

    origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if origins:
        print(f"  ✓ ALLOWED_ORIGINS: {origins}")
    else:
        print("  ⚠ ALLOWED_ORIGINS not set (localhost defaults only)")


def verify_health_endpoint() -> None:
    port = int(os.environ.get("BACKEND_VERIFY_PORT", "8000"))
    env = os.environ.copy()
    env.setdefault("ASSETS_URL", DEFAULT_ASSETS_URL)

    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=BACKEND_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        deadline = time.time() + 180
        health_url = f"http://127.0.0.1:{port}/health"
        last_error = "timeout"

        while time.time() < deadline:
            if proc.poll() is not None:
                output = proc.stdout.read() if proc.stdout else ""
                raise RuntimeError(f"uvicorn exited early:\n{output[-2000:]}")

            try:
                with urllib.request.urlopen(health_url, timeout=5) as resp:
                    payload = json.loads(resp.read().decode())
                if payload.get("status") == "ok" and payload.get("mapper_loaded"):
                    print(f"  ✓ GET /health → {payload}")
                    return
                last_error = f"unexpected payload: {payload}"
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = str(exc)
            time.sleep(2)

        raise RuntimeError(f"/health not ready: {last_error}")
    finally:
        if proc.poll() is None:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify FastAPI Phase 3 production config")
    parser.add_argument(
        "--health",
        action="store_true",
        help="Start uvicorn locally and verify GET /health (slow, ~1–2 min)",
    )
    args = parser.parse_args()

    _load_env()
    print("FastAPI Phase 3 verification")
    print()

    verify_assets_url()
    verify_pocketbase()
    verify_optional_keys()

    if args.health:
        print()
        print("Starting uvicorn for /health check…")
        verify_health_endpoint()

    print()
    print("Phase 3 config OK.")
    print("Next: fill backend/.env from backend/dokploy.env.example, then deploy (Phase 4).")


if __name__ == "__main__":
    main()
