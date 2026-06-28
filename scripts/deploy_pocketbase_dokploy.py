#!/usr/bin/env python3
"""Deploy PocketBase to Dockploy via REST API.

Requires:
  DOKPLOY_URL=https://cashbackbrain.ru
  DOKPLOY_API_KEY=...

Optional:
  DOKPLOY_PROJECT_NAME, DOKPLOY_ENVIRONMENT_NAME, POCKETBASE_DOMAIN
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

# ghcr.io is often blocked from RU VPS; Docker Hub community image (same layout: /pb/pb_data).
POCKETBASE_IMAGE = os.environ.get(
    "POCKETBASE_DOCKER_IMAGE", "jasonc/pocketbase:latest"
)
POCKETBASE_COMMAND = os.environ.get("POCKETBASE_COMMAND", "").strip() or None
POCKETBASE_PORT = 8090
MOUNT_PATH = "/pb/pb_data"
VOLUME_NAME = "pocketbase_pb_data"
APP_NAME = "pocketbase"


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing env var: {name}")
    return value


class DokployClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {
            "x-api-key": api_key,
            "Content-Type": "application/json",
        }

    def post(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self._base}/api/{path}"
        body = json.dumps(payload or {}).encode("utf-8")
        request = urllib.request.Request(url, data=body, headers=self._headers, method="POST")
        return self._read(request, path)

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        query = urllib.parse.urlencode(params or {}, doseq=True)
        url = f"{self._base}/api/{path}"
        if query:
            url = f"{url}?{query}"
        request = urllib.request.Request(url, headers=self._headers, method="GET")
        return self._read(request, path)

    @staticmethod
    def _read(request: urllib.request.Request, path: str) -> Any:
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"{request.method} {path} → {exc.code}: {detail}") from exc
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))


def _unwrap_list(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("data", "items", "results", "projects", "environments", "applications"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _pick_by_name(items: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    target = name.strip().lower()
    for item in items:
        for field in ("name", "title"):
            if str(item.get(field, "")).strip().lower() == target:
                return item
    return None


def _find_environment_id(client: DokployClient) -> str:
    project_name = os.environ.get("DOKPLOY_PROJECT_NAME", "CashbackBrain").strip()
    env_name = os.environ.get("DOKPLOY_ENVIRONMENT_NAME", "production").strip()

    projects: list[dict[str, Any]] = []
    for endpoint in ("project.all", "project.search"):
        try:
            projects = _unwrap_list(client.get(endpoint))
            if projects:
                break
        except RuntimeError:
            continue

    if not projects:
        print("No projects found — creating CashbackBrain...")
        created = client.post(
            "project.create",
            {"name": project_name, "description": "Cashback aggregator"},
        )
        if isinstance(created, dict) and "environment" in created:
            env = created["environment"]
            environment_id = str(env.get("environmentId") or env.get("id") or "")
            if environment_id:
                project = created.get("project", {})
                print(
                    f"Created project: {project.get('name', project_name)} "
                    f"→ Environment: {env.get('name', env_name)} ({environment_id})"
                )
                return environment_id
        projects = _unwrap_list(client.get("project.all"))

    if not projects:
        raise RuntimeError(
            "Could not list or create Dockploy projects. "
            "Create a project in Dockploy UI or check API key permissions."
        )

    project = _pick_by_name(projects, project_name) if project_name else projects[0]
    if project is None:
        project = projects[0]
    project_id = str(project.get("projectId") or project.get("id") or "")
    if not project_id:
        raise RuntimeError(f"Project has no id: {json.dumps(project, ensure_ascii=False)[:200]}")

    try:
        environments = _unwrap_list(
            client.get("environment.byProjectId", {"projectId": project_id})
        )
    except RuntimeError:
        environments = _unwrap_list(client.get("environment.search", {"projectId": project_id}))

    if not environments:
        raise RuntimeError(f"No environments for project {project.get('name', project_id)}")

    environment = _pick_by_name(environments, env_name) if env_name else environments[0]
    if environment is None:
        environment = environments[0]
    environment_id = str(environment.get("environmentId") or environment.get("id") or "")
    if not environment_id:
        raise RuntimeError(f"Environment has no id: {json.dumps(environment, ensure_ascii=False)[:200]}")

    print(f"Project: {project.get('name')} → Environment: {environment.get('name')} ({environment_id})")
    return environment_id


def _find_existing_app(client: DokployClient, environment_id: str) -> dict[str, Any] | None:
    try:
        apps = _unwrap_list(client.get("application.search", {"environmentId": environment_id, "limit": 100}))
    except RuntimeError:
        return None
    for app in apps:
        for field in ("name", "appName"):
            if str(app.get(field, "")).strip().lower() == APP_NAME:
                return app
    return None


def _application_id(app: dict[str, Any]) -> str:
    app_id = str(app.get("applicationId") or app.get("id") or "")
    if not app_id:
        raise RuntimeError(f"Application response missing id: {app}")
    return app_id


def deploy_pocketbase(client: DokployClient) -> str:
    environment_id = _find_environment_id(client)
    existing = _find_existing_app(client, environment_id)

    if existing:
        application_id = _application_id(existing)
        print(f"PocketBase app already exists: {application_id}")
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
        application_id = _application_id(created if isinstance(created, dict) else {})
        print(f"Created application: {application_id}")

    client.post(
        "application.saveDockerProvider",
        {
            "applicationId": application_id,
            "dockerImage": POCKETBASE_IMAGE,
            "username": None,
            "password": None,
            "registryUrl": None,
        },
    )
    print("Docker image configured")

    update_payload: dict[str, Any] = {
        "applicationId": application_id,
        "sourceType": "docker",
    }
    if POCKETBASE_COMMAND is not None:
        update_payload["command"] = POCKETBASE_COMMAND
    client.post("application.update", update_payload)
    if POCKETBASE_COMMAND:
        print(f"Command configured: {POCKETBASE_COMMAND}")
    else:
        print("Command cleared (image default)")

    try:
        mounts = _unwrap_list(
            client.get(
                "mounts.listByServiceId",
                {"serviceId": application_id, "serviceType": "application"},
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
                "volumeName": VOLUME_NAME,
                "mountPath": MOUNT_PATH,
                "serviceId": application_id,
                "serviceType": "application",
            },
        )
        print(f"Volume mount created: {MOUNT_PATH}")
    else:
        print("Volume mount already exists")

    domain_host = os.environ.get("POCKETBASE_DOMAIN", "pb.cashbackbrain.ru").strip()
    try:
        domains = _unwrap_list(client.get("domain.byApplicationId", {"applicationId": application_id}))
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
                "applicationId": application_id,
            },
        )
        print(f"Domain configured: https://{domain_host}")
    else:
        print(f"Domain already configured: {domain_host}")

    client.post("application.deploy", {"applicationId": application_id})
    print("Deploy triggered")
    return application_id


def main() -> None:
    base_url = _require("DOKPLOY_URL")
    api_key = _require("DOKPLOY_API_KEY")
    app_id = deploy_pocketbase(DokployClient(base_url, api_key))

    print()
    print("Done. Next steps:")
    print("  1. Wait ~1 min, then open https://pb.cashbackbrain.ru/_/")
    print("  2. Create superadmin (one-time)")
    print("  3. Run: python scripts/setup_pocketbase.py --import-catalog")
    print(f"  (applicationId: {app_id})")


if __name__ == "__main__":
    main()
