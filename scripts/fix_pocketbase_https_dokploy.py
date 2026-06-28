#!/usr/bin/env python3
"""Re-provision Let's Encrypt for pb.cashbackbrain.ru via Dokploy API.

Requires DOKPLOY_URL and DOKPLOY_API_KEY (.env.dokploy).
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

APP_ID = os.environ.get("POCKETBASE_APP_ID", "XyZ0MqDBRS4xQQ6hmtCoJ")
DOMAIN = os.environ.get("POCKETBASE_DOMAIN", "pb.cashbackbrain.ru")
PORT = 8090


class Client:
    def __init__(self, base_url: str, api_key: str) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"x-api-key": api_key, "Content-Type": "application/json"}

    def post(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self._base}/api/{path}"
        body = json.dumps(payload or {}).encode()
        req = urllib.request.Request(url, data=body, headers=self._headers, method="POST")
        return self._read(req, path)

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self._base}/api/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers=self._headers, method="GET")
        return self._read(req, path)

    @staticmethod
    def _read(req: urllib.request.Request, path: str) -> Any:
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:600]
            raise RuntimeError(f"{req.method} {path} → {exc.code}: {detail}") from exc
        if not raw:
            return True
        return json.loads(raw.decode("utf-8"))


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing env var: {name}")
    return value


def _cert_issuer(host: str) -> str:
    import subprocess

    result = subprocess.run(
        [
            "openssl",
            "s_client",
            "-connect",
            f"{host}:443",
            "-servername",
            host,
        ],
        input=b"",
        capture_output=True,
        timeout=20,
    )
    if result.returncode != 0:
        return "unknown"
    x509 = subprocess.run(
        ["openssl", "x509", "-noout", "-issuer"],
        input=result.stdout,
        capture_output=True,
        text=True,
        timeout=10,
    )
    return x509.stdout.strip() if x509.returncode == 0 else "unknown"


def main() -> None:
    client = Client(_require("DOKPLOY_URL"), _require("DOKPLOY_API_KEY"))

    domains = client.get("domain.byApplicationId", {"applicationId": APP_ID})
    if not isinstance(domains, list) or not domains:
        raise SystemExit(f"No domain configured for application {APP_ID}")

    domain = next((d for d in domains if str(d.get("host", "")).lower() == DOMAIN.lower()), domains[0])
    domain_id = str(domain["domainId"])

    client.post(
        "domain.update",
        {
            "domainId": domain_id,
            "host": DOMAIN,
            "port": PORT,
            "https": True,
            "certificateType": "letsencrypt",
            "path": "/",
            "domainType": "application",
        },
    )
    print(f"Domain updated: {DOMAIN} (letsencrypt)")

    client.post("application.deploy", {"applicationId": APP_ID})
    print("Application redeployed")

    client.post("settings.reloadTraefik", {})
    print("Traefik reloaded — waiting 45s for ACME...")
    time.sleep(45)

    issuer = _cert_issuer(DOMAIN)
    print(f"Certificate issuer: {issuer}")

    ctx = ssl.create_default_context()
    req = urllib.request.Request(f"https://{DOMAIN}/api/health", method="GET")
    with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
        print(f"HTTPS verify OK: HTTP {resp.status}")

    if "Let's Encrypt" not in issuer:
        print("Warning: still not Let's Encrypt — check Dokploy Traefik logs", file=sys.stderr)
        sys.exit(1)

    print(f"Done. Admin UI: https://{DOMAIN}/_/  (root / returns 404 — это нормально)")


if __name__ == "__main__":
    main()
