#!/usr/bin/env python3
"""Create PocketBase superuser via Dokploy one-shot Compose + optional catalog import.

Requires DOKPLOY_URL and DOKPLOY_API_KEY (see .env.dokploy).
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
ENV_ID = os.environ.get("DOKPLOY_ENVIRONMENT_ID", "MfP70YkCDVRdFG2t7pQh2")
EMAIL = os.environ.get("POCKETBASE_ADMIN_EMAIL", "admin@cashbackbrain.ru")
PASSWORD = os.environ.get("POCKETBASE_ADMIN_PASSWORD", "TempSetup2026abc")
DOMAIN = os.environ.get("POCKETBASE_DOMAIN", "pb.cashbackbrain.ru")
VOLUME = os.environ.get("POCKETBASE_VOLUME", "pocketbase_pb_data")
IMPORT_CATALOG = os.environ.get("POCKETBASE_IMPORT_CATALOG", "1") == "1"


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
            return bool(json.loads(resp.read()).get("token"))
    except urllib.error.HTTPError:
        return False


def _compose_yaml(email: str, password: str) -> str:
    return f"""services:
  pb-init:
    image: jasonc/pocketbase:latest
    entrypoint: ["/pb/pocketbase"]
    command: ["superuser", "upsert", "{email}", "{password}"]
    volumes:
      - {VOLUME}:/pb/pb_data
    restart: "no"
volumes:
  {VOLUME}:
    external: true
"""


def main() -> None:
    client = Client(_require("DOKPLOY_URL"), _require("DOKPLOY_API_KEY"))

    if _auth_ok(EMAIL, PASSWORD):
        print(f"Superuser already exists: {EMAIL}")
    else:
        created = client.post(
            "compose.create",
            {
                "name": "pb-init",
                "appName": "pb-init",
                "description": "One-shot superuser creation",
                "environmentId": ENV_ID,
                "composeFile": _compose_yaml(EMAIL, PASSWORD),
                "sourceType": "raw",
            },
        )
        compose_id = str(created.get("composeId", ""))
        client.post("compose.update", {"composeId": compose_id, "sourceType": "raw"})
        print(f"Compose init service: {compose_id}")

        client.post("application.stop", {"applicationId": APP_ID})
        time.sleep(8)
        client.post("compose.deploy", {"composeId": compose_id})
        print("Init deploy triggered — waiting 50s...")
        time.sleep(50)

        if not _auth_ok(EMAIL, PASSWORD):
            raise SystemExit("Superuser creation failed — check pb-init compose logs in Dokploy")

        client.post("application.deploy", {"applicationId": APP_ID})
        print("PocketBase redeployed")
        time.sleep(30)

    print()
    print("Admin UI: https://pb.cashbackbrain.ru/_/")
    print(f"  Email:    {EMAIL}")
    print(f"  Password: {PASSWORD}")
    print("  (change password in Admin UI → your profile)")

    if IMPORT_CATALOG:
        print()
        print("Running setup_pocketbase.py --import-catalog ...")
        env = os.environ.copy()
        env.setdefault("POCKETBASE_URL", f"https://{DOMAIN}")
        env.setdefault("POCKETBASE_ADMIN_EMAIL", EMAIL)
        env.setdefault("POCKETBASE_ADMIN_PASSWORD", PASSWORD)
        env.setdefault("POCKETBASE_SSL_VERIFY", "false")
        import subprocess

        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        result = subprocess.run(
            [sys.executable, os.path.join(repo, "scripts", "setup_pocketbase.py"), "--import-catalog"],
            env=env,
            cwd=repo,
        )
        raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
