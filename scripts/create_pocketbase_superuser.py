#!/usr/bin/env python3
"""Create PocketBase superuser via Dokploy one-shot command + import catalog."""
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
EMAIL = os.environ.get("POCKETBASE_ADMIN_EMAIL", "admin@cashbackbrain.ru")
PASSWORD = os.environ.get("POCKETBASE_ADMIN_PASSWORD", "CashbackBrain-Temp-2026!")
DOMAIN = os.environ.get("POCKETBASE_DOMAIN", "pb.cashbackbrain.ru")


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
            with urllib.request.urlopen(req, timeout=120) as resp:
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


def _auth_ok(email: str, password: str) -> bool:
    url = f"https://{DOMAIN}/api/collections/_superusers/auth-with-password"
    payload = json.dumps({"identity": email, "password": password}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            data = json.loads(resp.read())
            return bool(data.get("token"))
    except urllib.error.HTTPError:
        return False


def main() -> None:
    client = Client(_require("DOKPLOY_URL"), _require("DOKPLOY_API_KEY"))

    if _auth_ok(EMAIL, PASSWORD):
        print(f"Superuser already works: {EMAIL}")
    else:
        # One-shot: create superuser then serve (Alpine has /bin/sh, not bash)
        upsert_cmd = (
            f"/pb/pocketbase superuser upsert {EMAIL} '{PASSWORD}' && "
            "exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data"
        )
        shell_cmd = f"sh -c {json.dumps(upsert_cmd)}"

        try:
            client.post("application.stop", {"applicationId": APP_ID})
            time.sleep(5)
        except RuntimeError:
            pass

        client.post(
            "application.update",
            {"applicationId": APP_ID, "sourceType": "docker", "command": shell_cmd},
        )
        print("One-shot superuser command set")
        client.post("application.deploy", {"applicationId": APP_ID})
        print("Deploy triggered — waiting 60s...")
        time.sleep(60)

        if not _auth_ok(EMAIL, PASSWORD):
            app = client.get("application.one", {"applicationId": APP_ID})
            deps = client.get("deployment.all", {"applicationId": APP_ID})
            logs = ""
            if isinstance(deps, list) and deps:
                logs = client.get(
                    "deployment.readLogs",
                    {"deploymentId": deps[0]["deploymentId"], "tail": 80},
                )
            print("Auth still failing. Deploy logs:")
            print(logs if isinstance(logs, str) else json.dumps(logs))
            sys.exit(1)

        print(f"Superuser created: {EMAIL}")

        # Restore empty command (stable Swarm config)
        client.post(
            "application.update",
            {"applicationId": APP_ID, "sourceType": "docker", "command": None},
        )
        client.post("application.deploy", {"applicationId": APP_ID})
        print("Command cleared, redeployed")
        time.sleep(45)

    print()
    print("Credentials (change password in Admin UI → Settings):")
    print(f"  URL:      https://{DOMAIN}/_/")
    print(f"  Email:    {EMAIL}")
    print(f"  Password: {PASSWORD}")
    print()
    print("Run import:")
    print(f"  POCKETBASE_URL=https://{DOMAIN} \\")
    print(f"  POCKETBASE_ADMIN_EMAIL={EMAIL} \\")
    print(f"  POCKETBASE_ADMIN_PASSWORD='{PASSWORD}' \\")
    print("  python scripts/setup_pocketbase.py --import-catalog")


if __name__ == "__main__":
    main()
