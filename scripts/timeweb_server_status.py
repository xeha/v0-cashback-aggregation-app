#!/usr/bin/env python3
"""Timeweb Cloud VPS status and disk backups.

Usage:
  python3 scripts/timeweb_server_status.py status
  python3 scripts/timeweb_server_status.py backups
  python3 scripts/timeweb_server_status.py backup-create --comment "before deploy"

Requires .env.timeweb (TIMEWEB_CLOUD_TOKEN).
Optional: TIMEWEB_SERVER_ID, TIMEWEB_SERVER_NAME (default CashbackBrain).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dokploy_common import REPO_ROOT, load_env_file

API_BASE = "https://api.timeweb.cloud/api/v1"
DEFAULT_SERVER_NAME = "CashbackBrain"


def load_timeweb_env() -> None:
    load_env_file(REPO_ROOT / ".env.timeweb", override=True)


def require_token() -> str:
    token = os.environ.get("TIMEWEB_CLOUD_TOKEN", "").strip()
    if not token:
        raise SystemExit("Missing TIMEWEB_CLOUD_TOKEN — set in .env.timeweb (see timeweb.env.example)")
    return token


class TimewebClient:
    def __init__(self, token: str) -> None:
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def get(self, path: str) -> Any:
        request = urllib.request.Request(f"{API_BASE}/{path.lstrip('/')}", headers=self._headers, method="GET")
        return self._read(request)

    def post(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        body = json.dumps(payload or {}).encode("utf-8")
        request = urllib.request.Request(
            f"{API_BASE}/{path.lstrip('/')}",
            data=body,
            headers=self._headers,
            method="POST",
        )
        return self._read(request)

    @staticmethod
    def _read(request: urllib.request.Request) -> Any:
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise RuntimeError(f"{request.method} {request.full_url} → {exc.code}: {detail}") from exc
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))


def unwrap_server(data: Any) -> dict[str, Any]:
    if isinstance(data, dict) and isinstance(data.get("server"), dict):
        return data["server"]
    if isinstance(data, dict) and data.get("id"):
        return data
    raise RuntimeError(f"Unexpected server response: {data!r}")


def unwrap_servers(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        servers = data.get("servers")
        if isinstance(servers, list):
            return [item for item in servers if isinstance(item, dict)]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def unwrap_backups(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        backups = data.get("backups")
        if isinstance(backups, list):
            return [item for item in backups if isinstance(item, dict)]
    return []


def format_mib(mib: int | float) -> str:
    value = float(mib)
    if value >= 1024:
        return f"{value / 1024:.1f} GiB"
    return f"{int(value)} MiB"


def primary_ipv4(server: dict[str, Any]) -> str | None:
    for network in server.get("networks") or []:
        if not isinstance(network, dict):
            continue
        for ip_info in network.get("ips") or []:
            if not isinstance(ip_info, dict):
                continue
            if ip_info.get("type") == "ipv4" and ip_info.get("is_main"):
                return str(ip_info.get("ip") or "")
    return None


def system_disk(server: dict[str, Any]) -> dict[str, Any]:
    for disk in server.get("disks") or []:
        if isinstance(disk, dict) and disk.get("is_system"):
            return disk
    disks = server.get("disks") or []
    if disks and isinstance(disks[0], dict):
        return disks[0]
    raise RuntimeError("Server has no disks in API response")


def resolve_server_id(client: TimewebClient) -> int:
    explicit = os.environ.get("TIMEWEB_SERVER_ID", "").strip()
    if explicit:
        return int(explicit)

    name = os.environ.get("TIMEWEB_SERVER_NAME", DEFAULT_SERVER_NAME).strip().lower()
    servers = unwrap_servers(client.get("servers"))
    if not servers:
        raise RuntimeError("No servers found in Timeweb account")

    for server in servers:
        if str(server.get("name", "")).strip().lower() == name:
            return int(server["id"])

    if len(servers) == 1:
        return int(servers[0]["id"])

    names = ", ".join(str(s.get("name", "?")) for s in servers)
    raise RuntimeError(f"Server {name!r} not found. Available: {names}. Set TIMEWEB_SERVER_ID.")


def fetch_server(client: TimewebClient, server_id: int) -> dict[str, Any]:
    return unwrap_server(client.get(f"servers/{server_id}"))


def cmd_status(client: TimewebClient) -> int:
    server_id = resolve_server_id(client)
    server = fetch_server(client, server_id)
    disk = system_disk(server)

    disk_size = int(disk.get("size") or 0)
    disk_used = int(disk.get("used") or 0)
    disk_free = max(disk_size - disk_used, 0)
    disk_pct = round(disk_used / disk_size * 100) if disk_size else 0

    print(f"Server:  {server.get('name')} (id={server_id})")
    print(f"Status:  {server.get('status')}")
    print(f"CPU:     {server.get('cpu')} x {server.get('cpu_frequency')} GHz")
    print(f"RAM:     {format_mib(int(server.get('ram') or 0))}")
    print(
        f"Disk:    {format_mib(disk_used)} used / {format_mib(disk_size)} total "
        f"({disk_pct}% used, {format_mib(disk_free)} free)"
    )
    print(f"OS:      {server.get('os', {}).get('name')} {server.get('os', {}).get('version')}")
    print(f"IPv4:    {primary_ipv4(server) or '—'}")
    print(f"Zone:    {server.get('availability_zone')}")
    print(f"Auto backup: {'yes' if disk.get('is_auto_backup') else 'no'}")
    print(f"Started: {server.get('start_at')}")
    return 0


def cmd_backups(client: TimewebClient) -> int:
    server_id = resolve_server_id(client)
    server = fetch_server(client, server_id)
    disk = system_disk(server)
    disk_id = int(disk["id"])

    data = client.get(f"servers/{server_id}/disks/{disk_id}/backups")
    backups = unwrap_backups(data)
    total = data.get("meta", {}).get("total") if isinstance(data, dict) else len(backups)

    print(f"Backups for {server.get('name')} disk {disk_id} (total={total}):")
    if not backups:
        print("  (none)")
        return 0

    for backup in backups:
        size_mib = int(backup.get("size") or 0)
        print(
            f"  id={backup.get('id')}  status={backup.get('status')}  "
            f"type={backup.get('type')}  size={format_mib(size_mib)}  "
            f"created={backup.get('created_at')}  comment={backup.get('comment')!r}"
        )
    return 0


def cmd_backup_create(client: TimewebClient, comment: str) -> int:
    server_id = resolve_server_id(client)
    server = fetch_server(client, server_id)
    disk = system_disk(server)
    disk_id = int(disk["id"])

    payload: dict[str, Any] = {}
    if comment.strip():
        payload["comment"] = comment.strip()

    print(f"Creating backup for {server.get('name')} disk {disk_id}…")
    data = client.post(f"servers/{server_id}/disks/{disk_id}/backups", payload)
    backup = data.get("backup") if isinstance(data, dict) else None
    if not isinstance(backup, dict):
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 1

    print(
        f"Backup created: id={backup.get('id')} status={backup.get('status')} "
        f"created_at={backup.get('created_at')}"
    )
    print("Note: snapshot and disk backup are mutually exclusive in Timeweb UI.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Timeweb Cloud VPS status and disk backups")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="Show server CPU/RAM/disk summary")
    sub.add_parser("backups", help="List disk backups")

    create = sub.add_parser("backup-create", help="Create a manual disk backup")
    create.add_argument("--comment", default="", help="Backup comment")

    args = parser.parse_args()
    load_timeweb_env()
    client = TimewebClient(require_token())

    if args.command == "status":
        raise SystemExit(cmd_status(client))
    if args.command == "backups":
        raise SystemExit(cmd_backups(client))
    if args.command == "backup-create":
        raise SystemExit(cmd_backup_create(client, args.comment))


if __name__ == "__main__":
    main()
