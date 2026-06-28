#!/usr/bin/env python3
"""Deploy PocketBase to Dokploy via REST API.

Requires DOKPLOY_URL, DOKPLOY_API_KEY (.env.dokploy).

Profiles via DOKPLOY_TARGET=development|production or deploy_environment_dokploy.py.

Optional:
  DOKPLOY_PROJECT_NAME, DOKPLOY_ENVIRONMENT_NAME, POCKETBASE_DOMAIN, POCKETBASE_VOLUME_NAME
"""
from __future__ import annotations

import os
import sys
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
    unwrap_list,
)

POCKETBASE_IMAGE = os.environ.get("POCKETBASE_DOCKER_IMAGE", "jasonc/pocketbase:latest")
POCKETBASE_COMMAND = os.environ.get("POCKETBASE_COMMAND", "").strip() or None
POCKETBASE_PORT = 8090
MOUNT_PATH = "/pb/pb_data"
APP_NAME = "pocketbase"


def deploy_pocketbase(client: DokployClient) -> str:
    environment_id = find_environment_id(client)
    existing = find_app_by_name(client, environment_id, APP_NAME)

    if existing:
        app_id = application_id(existing)
        print(f"PocketBase app already exists: {app_id}")
    else:
        created = client.post(
            "application.create",
            {
                "name": "PocketBase",
                "appName": APP_NAME,
                "description": "Auth + retailer_catalog + saved_matrices",
                "environmentId": environment_id,
            },
        )
        app_id = application_id(created if isinstance(created, dict) else {})
        print(f"Created application: {app_id}")

    client.post(
        "application.saveDockerProvider",
        {
            "applicationId": app_id,
            "dockerImage": POCKETBASE_IMAGE,
            "username": None,
            "password": None,
            "registryUrl": None,
        },
    )
    print("Docker image configured")

    update_payload: dict[str, Any] = {
        "applicationId": app_id,
        "sourceType": "docker",
    }
    if POCKETBASE_COMMAND is not None:
        update_payload["command"] = POCKETBASE_COMMAND
    client.post("application.update", update_payload)
    if POCKETBASE_COMMAND:
        print(f"Command configured: {POCKETBASE_COMMAND}")
    else:
        print("Command cleared (image default)")

    volume_name = os.environ.get("POCKETBASE_VOLUME_NAME", "pocketbase_pb_data").strip()

    try:
        mounts = unwrap_list(
            client.get(
                "mounts.listByServiceId",
                {"serviceId": app_id, "serviceType": "application"},
            )
        )
    except RuntimeError:
        mounts = []

    has_mount = any(str(m.get("mountPath", "")) == MOUNT_PATH for m in mounts)
    if not has_mount:
        client.post(
            "mounts.create",
            {
                "type": "volume",
                "volumeName": volume_name,
                "mountPath": MOUNT_PATH,
                "serviceId": app_id,
                "serviceType": "application",
            },
        )
        print(f"Volume mount created: {volume_name} → {MOUNT_PATH}")
    else:
        print(f"Volume mount already exists ({volume_name})")

    domain_host = os.environ.get("POCKETBASE_DOMAIN", "pb.cashbackbrain.ru").strip()
    try:
        domains = unwrap_list(client.get("domain.byApplicationId", {"applicationId": app_id}))
    except RuntimeError:
        domains = []

    has_domain = any(str(d.get("host", "")).lower() == domain_host.lower() for d in domains)
    if not has_domain:
        client.post(
            "domain.create",
            {
                "host": domain_host,
                "port": POCKETBASE_PORT,
                "https": True,
                "certificateType": "letsencrypt",
                "applicationId": app_id,
            },
        )
        print(f"Domain configured: https://{domain_host}")
    else:
        print(f"Domain already configured: {domain_host}")

    client.post("application.deploy", {"applicationId": app_id})
    print("Deploy triggered")
    return app_id


def main() -> None:
    load_dokploy_env()
    target = os.environ.get("DOKPLOY_TARGET", "").strip()
    if target:
        apply_deploy_profile(target)

    domain = os.environ.get("POCKETBASE_DOMAIN", "pb.cashbackbrain.ru").strip()
    app_id = deploy_pocketbase(DokployClient(require_env("DOKPLOY_URL"), require_env("DOKPLOY_API_KEY")))

    print()
    print("Done. Next steps:")
    print(f"  1. Wait ~1 min, then open https://{domain}/_/")
    print("  2. Create superadmin (one-time per environment)")
    print("  3. Run: POCKETBASE_URL=https://... python3 scripts/setup_pocketbase.py --import-catalog")
    print(f"  (applicationId: {app_id})")


if __name__ == "__main__":
    main()
