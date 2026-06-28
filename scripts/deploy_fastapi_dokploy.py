#!/usr/bin/env python3
"""Deploy FastAPI backend to Dokploy (GitHub + Dockerfile in backend/).

Requires:
  DOKPLOY_URL, DOKPLOY_API_KEY (.env.dokploy)

Backend env (merged into Dokploy application env):
  backend/.env, .env.pocketbase (POCKETBASE_*), or FASTAPI_ENV_FILE

Optional:
  FASTAPI_DOMAIN=api.cashbackbrain.ru
  FASTAPI_GITHUB_OWNER=xeha
  FASTAPI_GITHUB_REPO=v0-cashback-aggregation-app
  FASTAPI_GITHUB_BRANCH=main (or dev for development)
  FASTAPI_BUILD_PATH=backend
  DOKPLOY_GITHUB_ID=...
"""
from __future__ import annotations

import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dokploy_common import (
    ASSETS_URL,
    DokployClient,
    REPO_ROOT,
    application_id,
    apply_deploy_profile,
    ensure_domain,
    find_app_by_name,
    find_environment_id,
    load_dokploy_env,
    load_env_file,
    require_env,
    resolve_github_id,
)

APP_NAME = "fastapi"
APP_DISPLAY_NAME = "FastAPI"
APP_DESCRIPTION = "Cashback OCR + category mapping API"
FASTAPI_PORT = 8000
DEFAULT_DOMAIN = "api.cashbackbrain.ru"
DEFAULT_OWNER = "xeha"
DEFAULT_REPO = "v0-cashback-aggregation-app"
DEFAULT_BRANCH = "main"
DEFAULT_BUILD_PATH = "backend"

DEV_ALLOWED_ORIGINS = "https://dev.cashbackbrain.ru,http://localhost:3000"
PROD_ALLOWED_ORIGINS = (
    "https://cashbackbrain.ru,https://www.cashbackbrain.ru,http://localhost:3000"
)

ENV_KEYS = [
    "ASSETS_URL",
    "MISTRAL_API_KEY",
    "MISTRAL_REQUEST_TIMEOUT_SEC",
    "OCR_MAX_IMAGE_DIMENSION",
    "OCR_JPEG_QUALITY",
    "MISTRAL_VISION_MODEL",
    "MISTRAL_CLASSIFIER_MODEL",
    "ALLOWED_ORIGINS",
    "SENTENCE_TRANSFORMER_MODEL",
    "CATEGORY_PARENT_THRESHOLD",
    "CATEGORY_LEAF_THRESHOLD",
    "CATEGORY_LLM_FALLBACK",
    "RETAILER_ENRICH_ENABLED",
    "MISTRAL_RETAILER_MODEL",
    "MARKET_SPLIT_MAP_LLM_ENABLED",
    "MARKET_MAP_BATCH_SIZE",
    "MARKET_MAP_CONFIDENCE_MIN",
    "POCKETBASE_URL",
    "POCKETBASE_ADMIN_EMAIL",
    "POCKETBASE_ADMIN_PASSWORD",
    "ADMIN_KEY",
]


def load_backend_env() -> None:
    env_file = os.environ.get("FASTAPI_ENV_FILE", "").strip()
    if env_file:
        load_env_file(Path(env_file), override=True)
    else:
        load_env_file(REPO_ROOT / "backend" / ".env", override=True)
        load_env_file(REPO_ROOT / "backend" / "dokploy.env.example")

    load_env_file(
        REPO_ROOT / ".env.pocketbase",
        keys_only={
            "POCKETBASE_URL",
            "POCKETBASE_ADMIN_EMAIL",
            "POCKETBASE_ADMIN_PASSWORD",
        },
        override=True,
    )

    os.environ.setdefault("ASSETS_URL", ASSETS_URL)
    os.environ.setdefault("POCKETBASE_URL", "https://pb.cashbackbrain.ru")
    os.environ.setdefault("MISTRAL_REQUEST_TIMEOUT_SEC", "120")
    os.environ.setdefault("OCR_MAX_IMAGE_DIMENSION", "1200")

    target = os.environ.get("DOKPLOY_TARGET", "").strip().lower()
    default_origins = DEV_ALLOWED_ORIGINS if target in ("development", "dev") else PROD_ALLOWED_ORIGINS
    os.environ["ALLOWED_ORIGINS"] = os.environ.get("FASTAPI_ALLOWED_ORIGINS", default_origins)

    if not os.environ.get("ADMIN_KEY", "").strip():
        existing_id = os.environ.get("FASTAPI_APP_ID", "m3NsWg_snuw8lJ8ZrTthu").strip()
        try:
            load_dokploy_env()
            client = DokployClient(require_env("DOKPLOY_URL"), require_env("DOKPLOY_API_KEY"))
            app = client.get("application.one", {"applicationId": existing_id})
            if isinstance(app, dict):
                for line in str(app.get("env") or "").splitlines():
                    if line.startswith("ADMIN_KEY="):
                        os.environ["ADMIN_KEY"] = line.split("=", 1)[1].strip().strip('"')
                        print("Reusing ADMIN_KEY from Dokploy")
                        break
        except Exception:
            pass

    if not os.environ.get("ADMIN_KEY", "").strip():
        generated = secrets.token_hex(16)
        os.environ["ADMIN_KEY"] = generated
        print(f"Generated ADMIN_KEY: {generated}")
        print("  Save it to backend/.env — needed for /api/admin/reload-catalogs")


def build_env_block() -> str:
    missing: list[str] = []
    lines: list[str] = []

    for key in ENV_KEYS:
        value = os.environ.get(key, "").strip()
        if not value:
            if key in {"MISTRAL_API_KEY", "POCKETBASE_ADMIN_EMAIL", "POCKETBASE_ADMIN_PASSWORD", "ADMIN_KEY"}:
                missing.append(key)
            continue
        if any(ch in value for ch in ('"', "\n", "\\")):
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'{key}="{escaped}"')
        else:
            lines.append(f"{key}={value}")

    if missing:
        raise SystemExit(f"Missing required backend env: {', '.join(missing)}")

    return "\n".join(lines)


def ensure_git_branch_pushed(branch: str) -> None:
    if os.environ.get("FASTAPI_SKIP_GIT_PUSH", "").strip() in ("1", "true", "yes"):
        print(f"Skipping git push (FASTAPI_SKIP_GIT_PUSH) — deploy branch: {branch}")
        return

    try:
        local_sha = subprocess.check_output(
            ["git", "rev-parse", branch],
            cwd=REPO_ROOT,
            text=True,
        ).strip()
        try:
            remote_sha = subprocess.check_output(
                ["git", "rev-parse", f"origin/{branch}"],
                cwd=REPO_ROOT,
                text=True,
            ).strip()
            if local_sha == remote_sha:
                print(f"Git branch origin/{branch} is up to date ({local_sha[:8]})")
                return
        except subprocess.CalledProcessError:
            pass
    except subprocess.CalledProcessError:
        pass

    print(f"Pushing {branch} to origin for Dokploy build…")
    subprocess.run(
        ["git", "push", "-u", "origin", branch],
        cwd=REPO_ROOT,
        check=True,
    )


def deploy_fastapi(client: DokployClient) -> str:
    environment_id = find_environment_id(client)
    existing = find_app_by_name(client, environment_id, APP_NAME)

    if existing:
        app_id = application_id(existing)
        print(f"FastAPI app already exists: {app_id}")
    else:
        created = client.post(
            "application.create",
            {
                "name": APP_DISPLAY_NAME,
                "appName": APP_NAME,
                "description": APP_DESCRIPTION,
                "environmentId": environment_id,
            },
        )
        app_id = application_id(created if isinstance(created, dict) else {})
        print(f"Created application: {app_id}")

    github_id = resolve_github_id(client)
    owner = os.environ.get("FASTAPI_GITHUB_OWNER", DEFAULT_OWNER).strip()
    repo = os.environ.get("FASTAPI_GITHUB_REPO", DEFAULT_REPO).strip()
    branch = os.environ.get("FASTAPI_GITHUB_BRANCH", DEFAULT_BRANCH).strip()
    build_path = os.environ.get("FASTAPI_BUILD_PATH", DEFAULT_BUILD_PATH).strip()

    ensure_git_branch_pushed(branch)

    client.post(
        "application.saveGithubProvider",
        {
            "applicationId": app_id,
            "owner": owner,
            "repository": repo,
            "buildPath": build_path,
            "githubId": github_id,
            "branch": branch,
            "triggerType": "push",
        },
    )
    print(f"GitHub source: {owner}/{repo}@{branch} (buildPath={build_path})")

    client.post(
        "application.saveBuildType",
        {
            "applicationId": app_id,
            "buildType": "dockerfile",
            "dockerfile": "Dockerfile",
            "dockerContextPath": None,
            "dockerBuildStage": None,
            "herokuVersion": None,
            "railpackVersion": None,
        },
    )
    print("Build type: dockerfile")

    env_block = build_env_block()
    client.post(
        "application.saveEnvironment",
        {
            "applicationId": app_id,
            "env": env_block,
            "buildArgs": None,
            "buildSecrets": None,
            "createEnvFile": True,
        },
    )
    print(f"Environment saved ({len(env_block.splitlines())} vars)")

    domain = os.environ.get("FASTAPI_DOMAIN", DEFAULT_DOMAIN).strip()
    ensure_domain(client, app_id, domain, FASTAPI_PORT)

    client.post(
        "application.update",
        {
            "applicationId": app_id,
            "sourceType": "github",
        },
    )

    client.post("application.deploy", {"applicationId": app_id})
    print("Deploy triggered")
    return app_id


def wait_for_health(domain: str, timeout_sec: int = 600) -> dict[str, Any]:
    url = f"https://{domain}/health"
    deadline = time.time() + timeout_sec
    last_error = "timeout"

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                payload = resp.read().decode()
                import json

                data = json.loads(payload)
                if data.get("status") == "ok":
                    return data
                last_error = f"unexpected: {payload[:200]}"
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}"
        except Exception as exc:
            last_error = str(exc)
        print(f"  waiting for {url} … ({last_error})")
        time.sleep(15)

    raise RuntimeError(f"Health check failed for {url}: {last_error}")


def main() -> None:
    load_dokploy_env()
    target = os.environ.get("DOKPLOY_TARGET", "").strip()
    if target:
        apply_deploy_profile(target)
    load_backend_env()

    base_url = require_env("DOKPLOY_URL")
    api_key = require_env("DOKPLOY_API_KEY")
    domain = os.environ.get("FASTAPI_DOMAIN", DEFAULT_DOMAIN).strip()

    client = DokployClient(base_url, api_key)
    app_id = deploy_fastapi(client)

    if os.environ.get("FASTAPI_WAIT_HEALTH", "1").strip() not in ("0", "false", "no"):
        print()
        print(f"Waiting for https://{domain}/health (build may take 5–10 min)…")
        try:
            health = wait_for_health(domain)
            print(f"Health OK: {health}")
        except RuntimeError as exc:
            print(f"Warning: {exc}", file=sys.stderr)
            print("Check Dokploy build logs; first deploy includes model download.", file=sys.stderr)

    print()
    print("Done.")
    print(f"  API:    https://{domain}")
    print(f"  Docs:   https://{domain}/docs")
    print(f"  Health: https://{domain}/health")
    print(f"  appId:  {app_id}")


if __name__ == "__main__":
    main()
