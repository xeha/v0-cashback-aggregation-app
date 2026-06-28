#!/usr/bin/env python3
"""Fix PocketBase on Dokploy: clear command, redeploy, verify containers.

Requires DOKPLOY_URL and DOKPLOY_API_KEY (see .env.dokploy).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

APP_ID = os.environ.get("POCKETBASE_APP_ID", "XyZ0MqDBRS4xQQ6hmtCoJ")
IMAGE = os.environ.get("POCKETBASE_DOCKER_IMAGE", "jasonc/pocketbase:latest")
DOMAIN = os.environ.get("POCKETBASE_DOMAIN", "pb.cashbackbrain.ru")
PORT = 8090
MOUNT_PATH = "/pb/pb_data"
VOLUME_NAME = "pocketbase_pb_data"


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


def main() -> None:
    client = Client(_require("DOKPLOY_URL"), _require("DOKPLOY_API_KEY"))

    app = client.get("application.one", {"applicationId": APP_ID})
    app_name = str(app.get("appName") or "")
    print(f"App: {app.get('name')} ({app_name}) status={app.get('applicationStatus')}")

    # Stop if running (ignore errors — user may have stopped already)
    for endpoint in ("application.stop",):
        try:
            client.post(endpoint, {"applicationId": APP_ID})
            print("Stopped application")
            time.sleep(5)
        except RuntimeError as exc:
            print(f"Stop skipped: {exc}")

    client.post(
        "application.saveDockerProvider",
        {
            "applicationId": APP_ID,
            "dockerImage": IMAGE,
            "username": None,
            "password": None,
            "registryUrl": None,
        },
    )
    print(f"Docker image: {IMAGE}")

    # Empty command — jasonc image starts PocketBase by default
    client.post(
        "application.update",
        {"applicationId": APP_ID, "sourceType": "docker", "command": None},
    )
    print("Command cleared (use image default)")

    mounts = client.get(
        "mounts.listByServiceId",
        {"serviceId": APP_ID, "serviceType": "application"},
    )
    if not isinstance(mounts, list):
        mounts = []
    if not any(str(m.get("mountPath", "")) == MOUNT_PATH for m in mounts):
        client.post(
            "mounts.create",
            {
                "type": "volume",
                "volumeName": VOLUME_NAME,
                "mountPath": MOUNT_PATH,
                "serviceId": APP_ID,
                "serviceType": "application",
            },
        )
        print(f"Volume mount created: {MOUNT_PATH}")
    else:
        print("Volume mount OK")

    domains = client.get("domain.byApplicationId", {"applicationId": APP_ID})
    if not isinstance(domains, list):
        domains = []
    if not any(str(d.get("host", "")).lower() == DOMAIN.lower() for d in domains):
        client.post(
            "domain.create",
            {
                "host": DOMAIN,
                "port": PORT,
                "https": True,
                "certificateType": "letsencrypt",
                "applicationId": APP_ID,
            },
        )
        print(f"Domain created: {DOMAIN}")
    else:
        print(f"Domain OK: {DOMAIN}")

    client.post("application.deploy", {"applicationId": APP_ID})
    print("Deploy triggered — waiting 45s...")
    time.sleep(45)

    app = client.get("application.one", {"applicationId": APP_ID})
    print(f"App status: {app.get('applicationStatus')}")

    containers = client.get("docker.getContainers", {"appName": app_name})
    if isinstance(containers, list):
        running = [c for c in containers if str(c.get("state", "")).lower() == "running"]
        created = [c for c in containers if str(c.get("state", "")).lower() == "created"]
        print(f"Containers: {len(running)} running, {len(created)} created, {len(containers)} total")
        for c in containers[:3]:
            print(f"  - {c.get('name')} state={c.get('state')}")

    deps = client.get("deployment.all", {"applicationId": APP_ID})
    if isinstance(deps, list) and deps:
        dep = deps[0]
        logs = client.get(
            "deployment.readLogs",
            {"deploymentId": dep["deploymentId"], "tail": 40},
        )
        print("--- deploy logs ---")
        print(logs if isinstance(logs, str) else json.dumps(logs, ensure_ascii=False))

    # Health check
    health_url = f"https://{DOMAIN}/api/health"
    try:
        req = urllib.request.Request(health_url, method="GET")
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode()[:200]
            print(f"Health: HTTP {resp.status} {body}")
    except Exception as exc:
        print(f"Health check failed: {exc}")
        print()
        print("Containers stuck in 'created'? Try Compose deploy in Dokploy UI")
        print("or SSH: docker service ps", app_name)
        sys.exit(1)

    print()
    print("OK. Open https://pb.cashbackbrain.ru/_/ and create superadmin.")


if __name__ == "__main__":
    main()
