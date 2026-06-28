"""Shared helpers for Dokploy REST API scripts."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

ASSETS_URL = "https://fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru"
DEFAULT_PROJECT_NAME = "CashbackBrain"

# development → dev branch; production → main (лекция 7)
DEPLOY_PROFILES: dict[str, dict[str, str]] = {
    "development": {
        "DOKPLOY_ENVIRONMENT_NAME": "development",
        "GITHUB_BRANCH": "dev",
        "FRONTEND_DOMAIN": "dev.cashbackbrain.ru",
        "FASTAPI_DOMAIN": "api-dev.cashbackbrain.ru",
        "POCKETBASE_DOMAIN": "pb-dev.cashbackbrain.ru",
        "FASTAPI_ALLOWED_ORIGINS": "https://dev.cashbackbrain.ru,http://localhost:3000",
        "POCKETBASE_VOLUME_NAME": "pocketbase_pb_data_dev",
        "POCKETBASE_CORS_ORIGINS": (
            "https://dev.cashbackbrain.ru,http://localhost:3000,https://pb-dev.cashbackbrain.ru"
        ),
        "POCKETBASE_APP_URL": "https://dev.cashbackbrain.ru",
    },
    "production": {
        "DOKPLOY_ENVIRONMENT_NAME": "production",
        "GITHUB_BRANCH": "main",
        "FRONTEND_DOMAIN": "cashbackbrain.ru",
        "FASTAPI_DOMAIN": "api.cashbackbrain.ru",
        "POCKETBASE_DOMAIN": "pb.cashbackbrain.ru",
        "FASTAPI_ALLOWED_ORIGINS": (
            "https://cashbackbrain.ru,https://www.cashbackbrain.ru,http://localhost:3000"
        ),
        "POCKETBASE_VOLUME_NAME": "pocketbase_pb_data",
        "POCKETBASE_CORS_ORIGINS": (
            "https://cashbackbrain.ru,https://www.cashbackbrain.ru,"
            "http://localhost:3000,https://pb.cashbackbrain.ru"
        ),
        "POCKETBASE_APP_URL": "https://cashbackbrain.ru",
    },
}


def normalize_deploy_target(value: str) -> str:
    target = value.strip().lower()
    aliases = {"dev": "development", "prod": "production", "development": "development", "production": "production"}
    if target not in aliases:
        raise SystemExit(f"Unknown deploy target: {value!r}. Use: development, production")
    return aliases[target]


def apply_deploy_profile(target: str) -> dict[str, str]:
    """Set Dokploy env defaults for development or production (explicit env wins)."""
    profile_key = normalize_deploy_target(target)
    profile = DEPLOY_PROFILES[profile_key]

    for key, value in profile.items():
        os.environ.setdefault(key, value)

    branch = profile["GITHUB_BRANCH"]
    os.environ.setdefault("FRONTEND_GITHUB_BRANCH", branch)
    os.environ.setdefault("FASTAPI_GITHUB_BRANCH", branch)

    fastapi_domain = profile["FASTAPI_DOMAIN"]
    pocketbase_domain = profile["POCKETBASE_DOMAIN"]
    os.environ.setdefault("NEXT_PUBLIC_BACKEND_URL", f"https://{fastapi_domain}")
    os.environ.setdefault("NEXT_PUBLIC_POCKETBASE_URL", f"https://{pocketbase_domain}")
    os.environ.setdefault("POCKETBASE_URL", f"https://{pocketbase_domain}")

    print(f"Deploy profile: {profile_key} (branch={branch})")
    return profile


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


def load_dokploy_env() -> None:
    load_env_file(REPO_ROOT / ".env.dokploy", override=True)


def require_env(name: str) -> str:
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
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise RuntimeError(f"{request.method} {path} → {exc.code}: {detail}") from exc
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))


def unwrap_list(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("data", "items", "results", "projects", "environments", "applications"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def pick_by_name(items: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    target = name.strip().lower()
    for item in items:
        for field in ("name", "title", "appName"):
            if str(item.get(field, "")).strip().lower() == target:
                return item
    return None


def application_id(app: dict[str, Any]) -> str:
    app_id = str(app.get("applicationId") or app.get("id") or "")
    if not app_id:
        raise RuntimeError(f"Application response missing id: {app}")
    return app_id


def find_project(client: DokployClient, project_name: str | None = None) -> dict[str, Any]:
    name = (project_name or os.environ.get("DOKPLOY_PROJECT_NAME", DEFAULT_PROJECT_NAME)).strip()
    projects = unwrap_list(client.get("project.all"))
    if not projects:
        raise RuntimeError("No Dokploy projects found")
    project = pick_by_name(projects, name) or projects[0]
    project_id = str(project.get("projectId") or project.get("id") or "")
    if not project_id:
        raise RuntimeError(f"Project has no id: {project}")
    return project


def list_environments(client: DokployClient, project_id: str) -> list[dict[str, Any]]:
    try:
        return unwrap_list(client.get("environment.byProjectId", {"projectId": project_id}))
    except RuntimeError:
        return unwrap_list(client.get("environment.search", {"projectId": project_id}))


def ensure_environment_id(client: DokployClient) -> str:
    """Resolve environment id; create non-production environments when missing."""
    project_name = os.environ.get("DOKPLOY_PROJECT_NAME", DEFAULT_PROJECT_NAME).strip()
    env_name = os.environ.get("DOKPLOY_ENVIRONMENT_NAME", "production").strip()

    project = find_project(client, project_name)
    project_id = str(project.get("projectId") or project.get("id") or "")
    environments = list_environments(client, project_id)

    environment = pick_by_name(environments, env_name) if environments else None
    if environment is None and env_name.lower() != "production":
        print(f"Creating environment: {env_name}")
        created = client.post(
            "environment.create",
            {
                "name": env_name,
                "description": f"CashbackBrain {env_name}",
                "projectId": project_id,
            },
        )
        if isinstance(created, dict):
            environment_id = str(created.get("environmentId") or created.get("id") or "")
            if environment_id:
                print(f"Project: {project.get('name')} → Environment: {env_name} ({environment_id})")
                return environment_id
        environments = list_environments(client, project_id)
        environment = pick_by_name(environments, env_name)

    if not environments and env_name.lower() == "production":
        raise RuntimeError(f"No environments for project {project.get('name', project_id)}")

    if environment is None:
        environment = pick_by_name(environments, env_name) if environments else None
    if environment is None:
        environment = environments[0] if environments else None
    if environment is None:
        raise RuntimeError(f"Environment {env_name!r} not found in project {project.get('name')}")

    environment_id = str(environment.get("environmentId") or environment.get("id") or "")
    if not environment_id:
        raise RuntimeError(f"Environment has no id: {environment}")

    print(f"Project: {project.get('name')} → Environment: {environment.get('name')} ({environment_id})")
    return environment_id


def find_environment_id(client: DokployClient) -> str:
    if os.environ.get("DOKPLOY_ENSURE_ENVIRONMENT", "1").strip() not in ("0", "false", "no"):
        return ensure_environment_id(client)

    project_name = os.environ.get("DOKPLOY_PROJECT_NAME", DEFAULT_PROJECT_NAME).strip()
    env_name = os.environ.get("DOKPLOY_ENVIRONMENT_NAME", "production").strip()

    project = find_project(client, project_name)
    project_id = str(project.get("projectId") or project.get("id") or "")
    environments = list_environments(client, project_id)

    if not environments:
        raise RuntimeError(f"No environments for project {project.get('name', project_id)}")

    environment = pick_by_name(environments, env_name) or environments[0]
    environment_id = str(environment.get("environmentId") or environment.get("id") or "")
    if not environment_id:
        raise RuntimeError(f"Environment has no id: {environment}")

    print(f"Project: {project.get('name')} → Environment: {environment.get('name')} ({environment_id})")
    return environment_id


def find_app_by_name(client: DokployClient, environment_id: str, app_name: str) -> dict[str, Any] | None:
    try:
        apps = unwrap_list(client.get("application.search", {"environmentId": environment_id, "limit": 100}))
    except RuntimeError:
        return None
    target = app_name.strip().lower()
    for app in apps:
        for field in ("name", "title", "appName"):
            value = str(app.get(field, "")).strip().lower()
            if value == target or value.startswith(f"{target}-") or value.startswith(f"{target}_"):
                return app
    return None


def resolve_github_id(client: DokployClient) -> str:
    explicit = os.environ.get("DOKPLOY_GITHUB_ID", "").strip()
    if explicit:
        return explicit

    providers = unwrap_list(client.get("gitProvider.getAll"))
    for provider in providers:
        if provider.get("providerType") != "github":
            continue
        github = provider.get("github") or {}
        github_id = str(github.get("githubId") or "").strip()
        if github_id:
            print(f"GitHub provider: {provider.get('name')} ({github_id})")
            return github_id

    raise RuntimeError(
        "No GitHub provider in Dokploy. Connect GitHub in Settings or set DOKPLOY_GITHUB_ID."
    )


def ensure_domain(
    client: DokployClient,
    application_id: str,
    host: str,
    port: int,
) -> None:
    try:
        domains = unwrap_list(client.get("domain.byApplicationId", {"applicationId": application_id}))
    except RuntimeError:
        domains = []

    existing = next((d for d in domains if str(d.get("host", "")).lower() == host.lower()), None)
    if existing:
        print(f"Domain already configured: {host}")
        return

    client.post(
        "domain.create",
        {
            "host": host,
            "port": port,
            "https": True,
            "certificateType": "letsencrypt",
            "applicationId": application_id,
        },
    )
    print(f"Domain configured: https://{host}")
