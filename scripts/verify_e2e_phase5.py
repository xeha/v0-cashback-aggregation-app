#!/usr/bin/env python3
"""Phase 5 E2E verification — API, PocketBase, CORS, S3 logos, retailer lookup.

Usage:
  python3 scripts/verify_e2e_phase5.py
  FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent

API_URL = os.environ.get("E2E_API_URL", "https://api.cashbackbrain.ru").rstrip("/")
PB_URL = os.environ.get("E2E_POCKETBASE_URL", "https://pb.cashbackbrain.ru").rstrip("/")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://dev.cashbackbrain.ru").rstrip("/")
ASSETS_URL = os.environ.get(
    "E2E_ASSETS_URL",
    "https://fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru",
).rstrip("/")

passed = 0
failed = 0
skipped = 0


def load_env_file(path: Path, *, keys_only: set[str] | None = None, override: bool = False) -> None:
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


def ok(name: str, detail: str = "") -> None:
    global passed
    passed += 1
    suffix = f" — {detail}" if detail else ""
    print(f"  ✓ {name}{suffix}")


def fail(name: str, detail: str) -> None:
    global failed
    failed += 1
    print(f"  ✗ {name}: {detail}")


def skip(name: str, reason: str) -> None:
    global skipped
    skipped += 1
    print(f"  ○ {name} (skip: {reason})")


def check_api_health(client: httpx.Client) -> None:
    response = client.get(f"{API_URL}/health")
    response.raise_for_status()
    data = response.json()
    if data.get("status") != "ok" or not data.get("mapper_loaded"):
        raise RuntimeError(str(data))
    ok("FastAPI /health", str(data))


def check_pb_health(client: httpx.Client) -> None:
    response = client.get(f"{PB_URL}/api/health")
    response.raise_for_status()
    ok("PocketBase /api/health")


def check_frontend(client: httpx.Client) -> None:
    response = client.get(f"{FRONTEND_URL}/")
    response.raise_for_status()
    text = response.text.lower()
    if "dokploy" in text and "cashback" not in text:
        raise RuntimeError("frontend URL still serves Dokploy panel")
    ok("Frontend loads", FRONTEND_URL)


def check_cors(client: httpx.Client) -> None:
    origin = FRONTEND_URL
    response = client.options(
        f"{API_URL}/api/category/map",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    allow_origin = response.headers.get("access-control-allow-origin", "")
    if response.status_code not in (200, 204) or not allow_origin:
        raise RuntimeError(f"status={response.status_code}, allow-origin={allow_origin!r}")
    ok("CORS preflight", f"Allow-Origin={allow_origin}")


def check_s3_logo(client: httpx.Client) -> None:
    url = f"{ASSETS_URL}/logos/banks/t-bank.png"
    response = client.get(url)
    response.raise_for_status()
    if len(response.content) < 100:
        raise RuntimeError("logo file too small")
    ok("S3 logo", url)


def check_retailer_lookup(client: httpx.Client) -> None:
    payload = {
        "items": [{"raw_category": "Пятёрочка", "rate": 5}],
        "source_name": "Пятёрочка",
        "kind": "market",
        "source_slug": None,
    }
    response = client.post(f"{API_URL}/api/category/map", json=payload, timeout=60.0)
    response.raise_for_status()
    items = response.json().get("items") or []
    if not items:
        raise RuntimeError("empty map response")
    ok("retailer_catalog lookup", items[0].get("unified_category", "?"))


def check_pb_auth(client: httpx.Client) -> str | None:
    email = f"e2e_{secrets.token_hex(6)}@cashbackbrain.test"
    password = f"TestPass{secrets.token_hex(4)}!"

    create = client.post(
        f"{PB_URL}/api/collections/users/records",
        json={"email": email, "password": password, "passwordConfirm": password},
    )
    if create.status_code >= 400:
        raise RuntimeError(f"register {create.status_code}: {create.text[:200]}")

    auth = client.post(
        f"{PB_URL}/api/collections/users/auth-with-password",
        json={"identity": email, "password": password},
    )
    auth.raise_for_status()
    token = auth.json().get("token")
    if not token:
        raise RuntimeError("no token after auth")

    refresh = client.post(
        f"{PB_URL}/api/collections/users/auth-refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    refresh.raise_for_status()
    ok("PocketBase register + auth + refresh", email)
    return str(token)


def check_save_matrix(client: httpx.Client, token: str) -> None:
    auth_data = client.post(
        f"{PB_URL}/api/collections/users/auth-refresh",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    user_id = auth_data.get("record", {}).get("id")
    if not user_id:
        raise RuntimeError("no user id")

    payload = {
        "user": user_id,
        "title": "E2E test matrix",
        "period_month": 6,
        "period_year": 2026,
        "bank_matrix": {"kind": "bank", "providers": [], "rows": []},
        "market_matrix": None,
        "submissions": [],
        "summary": {"skipped": [], "lowConfidence": [], "bankOffers": []},
        "is_favorite": False,
    }
    response = client.post(
        f"{PB_URL}/api/collections/saved_matrices/records",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    response.raise_for_status()
    record_id = response.json().get("id")
    ok("saved_matrices create", record_id or "ok")


def main() -> None:
    load_env_file(REPO_ROOT / ".env.pocketbase", override=True)

    print("Phase 5 E2E verification")
    print(f"  API:      {API_URL}")
    print(f"  PocketBase: {PB_URL}")
    print(f"  Frontend: {FRONTEND_URL}")
    print()

    verify_ssl = os.environ.get("POCKETBASE_SSL_VERIFY", "true").lower() not in ("0", "false", "no")

    with httpx.Client(timeout=30.0, verify=verify_ssl, follow_redirects=True) as client:
        checks = [
            ("API health", lambda: check_api_health(client)),
            ("PocketBase health", lambda: check_pb_health(client)),
            ("Frontend", lambda: check_frontend(client)),
            ("CORS", lambda: check_cors(client)),
            ("S3 logos", lambda: check_s3_logo(client)),
            ("Retailer lookup", lambda: check_retailer_lookup(client)),
        ]

        token: str | None = None
        for label, fn in checks:
            try:
                fn()
            except Exception as exc:
                fail(label, str(exc))

        try:
            token = check_pb_auth(client)
        except Exception as exc:
            fail("PocketBase auth", str(exc))

        if token:
            try:
                check_save_matrix(client, token)
            except Exception as exc:
                fail("Save matrix", str(exc))
        else:
            skip("Save matrix", "no auth token")

    skip("OCR screenshot flow", "manual — upload screenshot in UI")

    print()
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")
    if failed:
        sys.exit(1)
    print("Phase 5 automated checks OK.")


if __name__ == "__main__":
    main()
