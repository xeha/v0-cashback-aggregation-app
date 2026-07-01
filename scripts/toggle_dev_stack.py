#!/usr/bin/env python3
"""Start/stop CashbackBrain development stack in Dokploy (on-demand dev testing).

Usage:
  python3 scripts/toggle_dev_stack.py status
  python3 scripts/toggle_dev_stack.py start
  python3 scripts/toggle_dev_stack.py stop
  python3 scripts/toggle_dev_stack.py start --wait-health

Requires .env.dokploy (DOKPLOY_URL, DOKPLOY_API_KEY).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dokploy_common import (
    DokployClient,
    application_id,
    apply_deploy_profile,
    find_app_by_name,
    find_environment_id,
    load_dokploy_env,
    require_env,
)

START_ORDER = ("pocketbase", "fastapi", "frontend")
STOP_ORDER = tuple(reversed(START_ORDER))
RUNNING_STATUSES = frozenset({"done", "running"})
STOPPED_STATUSES = frozenset({"idle", "stopped"})

HEALTH_CHECKS: dict[str, tuple[str, dict[str, Any] | None]] = {
    "pocketbase": ("https://pb-dev.cashbackbrain.ru/api/health", None),
    "fastapi": (
        "https://api-dev.cashbackbrain.ru/health",
        {"status": "ok", "mapper_loaded": True},
    ),
    "frontend": ("https://dev.cashbackbrain.ru", None),
}

START_SLEEP_SEC = 8
HEALTH_TIMEOUT_SEC = 600
HEALTH_POLL_SEC = 15


def is_running(status: str | None) -> bool:
    if not status:
        return False
    return status.strip().lower() in RUNNING_STATUSES


def is_stopped(status: str | None) -> bool:
    if not status:
        return False
    return status.strip().lower() in STOPPED_STATUSES


def service_order(action: str) -> tuple[str, ...]:
    if action == "start":
        return START_ORDER
    if action == "stop":
        return STOP_ORDER
    raise ValueError(f"Unknown action: {action!r}")


@dataclass(frozen=True)
class DevApp:
    name: str
    app_id: str
    status: str


def _configure_development_profile() -> None:
    load_dokploy_env()
    os.environ["DOKPLOY_TARGET"] = "development"
    os.environ["DOKPLOY_ENVIRONMENT_NAME"] = "development"
    apply_deploy_profile("development")


def resolve_dev_apps(client: DokployClient) -> dict[str, DevApp]:
    environment_id = find_environment_id(client)
    apps: dict[str, DevApp] = {}
    for name in START_ORDER:
        found = find_app_by_name(client, environment_id, name)
        if not found:
            raise RuntimeError(
                f"Development app {name!r} not found in environment {environment_id}. "
                "Run deploy_environment_dokploy.py development first."
            )
        app_id = application_id(found)
        status = str(found.get("applicationStatus") or "unknown")
        apps[name] = DevApp(name=name, app_id=app_id, status=status)
    return apps


def refresh_status(client: DokployClient, app: DevApp) -> DevApp:
    payload = client.get("application.one", {"applicationId": app.app_id})
    status = str(payload.get("applicationStatus") or "unknown") if isinstance(payload, dict) else "unknown"
    return DevApp(name=app.name, app_id=app.app_id, status=status)


def start_app(client: DokployClient, app: DevApp) -> DevApp:
    app = refresh_status(client, app)
    if is_running(app.status):
        print(f"  {app.name}: already running ({app.status})")
        return app
    print(f"  {app.name}: starting ({app.app_id})…")
    client.post("application.start", {"applicationId": app.app_id})
    time.sleep(START_SLEEP_SEC)
    return refresh_status(client, app)


def stop_app(client: DokployClient, app: DevApp) -> DevApp:
    app = refresh_status(client, app)
    if is_stopped(app.status):
        print(f"  {app.name}: already stopped ({app.status})")
        return app
    print(f"  {app.name}: stopping ({app.app_id})…")
    try:
        client.post("application.stop", {"applicationId": app.app_id})
    except RuntimeError as exc:
        print(f"  {app.name}: stop warning: {exc}")
    time.sleep(START_SLEEP_SEC)
    return refresh_status(client, app)


def cmd_status(client: DokployClient) -> int:
    apps = resolve_dev_apps(client)
    print("Development stack status:")
    for name in START_ORDER:
        app = refresh_status(client, apps[name])
        state = "running" if is_running(app.status) else "stopped"
        print(f"  {name:12} {state:8} ({app.status})  id={app.app_id}")
    return 0


def cmd_start(client: DokployClient, *, wait_health: bool) -> int:
    apps = resolve_dev_apps(client)
    print("Starting development stack…")
    for name in START_ORDER:
        apps[name] = start_app(client, apps[name])
        print(f"  {name}: {apps[name].status}")

    if not wait_health:
        print("Done. Use --wait-health to poll HTTPS endpoints.")
        return 0

    print()
    print("Waiting for health checks…")
    for name in START_ORDER:
        url, expected_subset = HEALTH_CHECKS[name]
        wait_url_health(name, url, expected_subset)
    print("All health checks passed.")
    return 0


def cmd_stop(client: DokployClient) -> int:
    apps = resolve_dev_apps(client)
    print("Stopping development stack…")
    for name in STOP_ORDER:
        apps[name] = stop_app(client, apps[name])
        print(f"  {name}: {apps[name].status}")
    print("Done.")
    return 0


def wait_url_health(name: str, url: str, expected_subset: dict[str, Any] | None) -> None:
    deadline = time.time() + HEALTH_TIMEOUT_SEC
    last_error = "timeout"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                if expected_subset is not None:
                    data = json.loads(body)
                    if all(data.get(key) == value for key, value in expected_subset.items()):
                        print(f"  {name}: OK {url}")
                        return
                    last_error = f"unexpected body: {body[:200]}"
                elif 200 <= resp.status < 300:
                    print(f"  {name}: OK {url} (HTTP {resp.status})")
                    return
                last_error = f"HTTP {resp.status}"
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}"
        except Exception as exc:
            last_error = str(exc)
        print(f"  {name}: waiting {url} … ({last_error})")
        time.sleep(HEALTH_POLL_SEC)
    raise RuntimeError(f"Health check failed for {name} ({url}): {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Toggle CashbackBrain development stack in Dokploy")
    parser.add_argument(
        "action",
        choices=("status", "start", "stop"),
        help="status | start | stop",
    )
    parser.add_argument(
        "--wait-health",
        action="store_true",
        help="After start, poll pb-dev / api-dev / dev frontend health",
    )
    args = parser.parse_args()

    _configure_development_profile()
    client = DokployClient(require_env("DOKPLOY_URL"), require_env("DOKPLOY_API_KEY"))

    if args.action == "status":
        raise SystemExit(cmd_status(client))
    if args.action == "start":
        raise SystemExit(cmd_start(client, wait_health=args.wait_health))
    if args.action == "stop":
        raise SystemExit(cmd_stop(client))


if __name__ == "__main__":
    main()
