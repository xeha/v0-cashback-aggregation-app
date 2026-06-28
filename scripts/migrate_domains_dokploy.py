#!/usr/bin/env python3
"""Move Dokploy panel to dokploy.cashbackbrain.ru and frontend to cashbackbrain.ru.

Requires DOKPLOY_URL (current panel URL) and DOKPLOY_API_KEY (.env.dokploy).
After run, update DOKPLOY_URL=https://dokploy.cashbackbrain.ru in .env.dokploy.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dokploy_common import DokployClient, load_dokploy_env, require_env, unwrap_list

DOKPLOY_PANEL_HOST = "dokploy.cashbackbrain.ru"
FRONTEND_HOST = "cashbackbrain.ru"
FRONTEND_APP_ID = os.environ.get("FRONTEND_APP_ID", "NQrDe0KuBzGTtSYXLkHrJ")
FRONTEND_PORT = 3000
LETSENCRYPT_EMAIL = os.environ.get("DOKPLOY_LETSENCRYPT_EMAIL", "kseniya.agrova@gmail.com")


def _domain_by_host(domains: list[dict], host: str) -> dict | None:
    target = host.lower()
    return next((d for d in domains if str(d.get("host", "")).lower() == target), None)


def resolve_dokploy_client() -> DokployClient:
    load_dokploy_env()
    api_key = require_env("DOKPLOY_API_KEY")
    candidates = [
        os.environ.get("DOKPLOY_URL", "").strip(),
        f"https://{DOKPLOY_PANEL_HOST}",
        "https://cashbackbrain.ru",
    ]
    seen: set[str] = set()
    for url in candidates:
        if not url or url in seen:
            continue
        seen.add(url)
        client = DokployClient(url, api_key)
        try:
            client.get("settings.getWebServerSettings")
            print(f"  Dokploy API: {url}")
            return client
        except RuntimeError:
            continue
    raise SystemExit("Cannot reach Dokploy API — check DOKPLOY_URL and API key")


def migrate_dokploy_panel(client: DokployClient) -> None:
    current = client.get("settings.getWebServerSettings")
    print(f"  current panel host: {current.get('host')}")
    if str(current.get("host", "")).lower() == DOKPLOY_PANEL_HOST.lower():
        print(f"  ✓ Dokploy panel already on https://{DOKPLOY_PANEL_HOST}")
        return

    client.post(
        "settings.assignDomainServer",
        {
            "host": DOKPLOY_PANEL_HOST,
            "letsEncryptEmail": LETSENCRYPT_EMAIL,
            "certificateType": "letsencrypt",
            "https": True,
        },
    )
    print(f"  ✓ Dokploy panel → https://{DOKPLOY_PANEL_HOST}")

    client.post("settings.reloadTraefik", {})
    print("  ✓ Traefik reloaded")


def migrate_frontend_domain(client: DokployClient) -> None:
    domains = unwrap_list(
        client.get("domain.byApplicationId", {"applicationId": FRONTEND_APP_ID})
    )
    existing = _domain_by_host(domains, FRONTEND_HOST)
    if existing:
        print(f"  ✓ Frontend domain already set: {FRONTEND_HOST}")
    else:
        client.post(
            "domain.create",
            {
                "host": FRONTEND_HOST,
                "port": FRONTEND_PORT,
                "https": True,
                "certificateType": "letsencrypt",
                "applicationId": FRONTEND_APP_ID,
            },
        )
        print(f"  ✓ Frontend domain created: https://{FRONTEND_HOST}")

    dev = _domain_by_host(domains, "dev.cashbackbrain.ru")
    if dev and os.environ.get("KEEP_DEV_DOMAIN", "").strip() not in ("1", "true", "yes"):
        domain_id = str(dev.get("domainId"))
        try:
            client.post("domain.delete", {"domainId": domain_id})
            print("  ✓ Removed dev.cashbackbrain.ru (frontend now on root domain)")
        except RuntimeError as exc:
            print(f"  ~ Could not remove dev domain: {exc}")

    client.post("application.deploy", {"applicationId": FRONTEND_APP_ID})
    print("  ✓ Frontend redeploy triggered")


def wait_url(url: str, timeout_sec: int = 120) -> None:
    deadline = time.time() + timeout_sec
    last = "timeout"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                if resp.status == 200:
                    print(f"  ✓ {url} → HTTP 200")
                    return
                last = f"HTTP {resp.status}"
        except Exception as exc:
            last = str(exc)
        time.sleep(5)
    print(f"  ~ {url} not ready yet ({last})")


def patch_env_dokploy_url(repo_root: Path) -> None:
    env_path = repo_root / ".env.dokploy"
    if not env_path.is_file():
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    replaced = False
    for line in lines:
        if line.strip().startswith("DOKPLOY_URL="):
            out.append(f"DOKPLOY_URL=https://{DOKPLOY_PANEL_HOST}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"DOKPLOY_URL=https://{DOKPLOY_PANEL_HOST}")
    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"  ✓ Updated {env_path} → DOKPLOY_URL=https://{DOKPLOY_PANEL_HOST}")


def main() -> None:
    print("Domain migration")
    print()

    client = resolve_dokploy_client()

    print("1. Dokploy panel")
    migrate_dokploy_panel(client)
    print()

    print("2. Frontend domain")
    migrate_frontend_domain(client)
    print()

    print("3. Waiting for services…")
    time.sleep(20)
    wait_url(f"https://{DOKPLOY_PANEL_HOST}/")
    wait_url(f"https://{FRONTEND_HOST}/")

    patch_env_dokploy_url(Path(__file__).resolve().parent.parent)

    print()
    print("Done.")
    print(f"  Dokploy:  https://{DOKPLOY_PANEL_HOST}")
    print(f"  Frontend: https://{FRONTEND_HOST}")
    print(f"  API:      https://api.cashbackbrain.ru")
    print()
    print("Re-run with new URL:")
    print("  python3 scripts/setup_pocketbase_phase1.py  # refresh PB CORS if needed")
    print("  python3 scripts/verify_e2e_phase5.py")


if __name__ == "__main__":
    main()
