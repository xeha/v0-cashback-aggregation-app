#!/usr/bin/env python3
"""Deploy Next.js frontend to Dokploy (GitHub + root Dockerfile).

Requires DOKPLOY_URL, DOKPLOY_API_KEY (.env.dokploy).

Profiles via DOKPLOY_TARGET=development|production or deploy_environment_dokploy.py.
Default (no profile): production on cashbackbrain.ru, branch main.
"""
from __future__ import annotations

import os
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
    require_env,
    resolve_github_id,
)

APP_NAME = "frontend"
APP_DISPLAY_NAME = "CashbackBrain"
APP_DESCRIPTION = "Cashback aggregator Next.js frontend"
FRONTEND_PORT = 3000
DEFAULT_DOMAIN = "cashbackbrain.ru"
DEFAULT_OWNER = "xeha"
DEFAULT_REPO = "v0-cashback-aggregation-app"
DEFAULT_BRANCH = "main"
DEFAULT_BUILD_PATH = "."

PUBLIC_ENV_KEYS = [
    "NEXT_PUBLIC_BACKEND_URL",
    "NEXT_PUBLIC_POCKETBASE_URL",
    "NEXT_PUBLIC_ASSETS_URL",
]


def build_public_env() -> dict[str, str]:
    return {
        "NEXT_PUBLIC_BACKEND_URL": os.environ.get(
            "NEXT_PUBLIC_BACKEND_URL", "https://api.cashbackbrain.ru"
        ).strip(),
        "NEXT_PUBLIC_POCKETBASE_URL": os.environ.get(
            "NEXT_PUBLIC_POCKETBASE_URL", "https://pb.cashbackbrain.ru"
        ).strip(),
        "NEXT_PUBLIC_ASSETS_URL": os.environ.get("NEXT_PUBLIC_ASSETS_URL", ASSETS_URL).strip(),
    }


def env_block(vars_map: dict[str, str]) -> str:
    lines: list[str] = []
    for key, value in vars_map.items():
        if any(ch in value for ch in ('"', "\n", "\\")):
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'{key}="{escaped}"')
        else:
            lines.append(f"{key}={value}")
    return "\n".join(lines)


def ensure_git_branch_pushed(branch: str) -> None:
    if os.environ.get("FRONTEND_SKIP_GIT_PUSH", "").strip() in ("1", "true", "yes"):
        print(f"Skipping git push — branch: {branch}")
        return

    try:
        local_sha = subprocess.check_output(["git", "rev-parse", branch], cwd=REPO_ROOT, text=True).strip()
        remote_sha = subprocess.check_output(
            ["git", "rev-parse", f"origin/{branch}"],
            cwd=REPO_ROOT,
            text=True,
        ).strip()
        if local_sha == remote_sha:
            print(f"Git branch origin/{branch} up to date ({local_sha[:8]})")
            return
    except subprocess.CalledProcessError:
        pass

    print(f"Pushing {branch} to origin…")
    subprocess.run(["git", "push", "-u", "origin", branch], cwd=REPO_ROOT, check=True)


def deploy_frontend(client: DokployClient) -> str:
    environment_id = find_environment_id(client)
    existing = find_app_by_name(client, environment_id, APP_NAME)

    if existing:
        app_id = application_id(existing)
        print(f"Frontend app already exists: {app_id}")
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
    owner = os.environ.get("FRONTEND_GITHUB_OWNER", DEFAULT_OWNER).strip()
    repo = os.environ.get("FRONTEND_GITHUB_REPO", DEFAULT_REPO).strip()
    branch = os.environ.get("FRONTEND_GITHUB_BRANCH", DEFAULT_BRANCH).strip()
    build_path = os.environ.get("FRONTEND_BUILD_PATH", DEFAULT_BUILD_PATH).strip()

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
    print(f"GitHub source: {owner}/{repo}@{branch} (buildPath={build_path or '/'})")

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
    print("Build type: dockerfile (root)")

    public_env = build_public_env()
    block = env_block(public_env)
    client.post(
        "application.saveEnvironment",
        {
            "applicationId": app_id,
            "env": block,
            "buildArgs": block,
            "buildSecrets": None,
            "createEnvFile": True,
        },
    )
    print(f"Environment + buildArgs saved ({len(public_env)} vars)")

    domain = os.environ.get("FRONTEND_DOMAIN", DEFAULT_DOMAIN).strip()
    ensure_domain(client, app_id, domain, FRONTEND_PORT)

    client.post(
        "application.update",
        {"applicationId": app_id, "sourceType": "github", "cleanCache": True},
    )

    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True).strip()
    client.post(
        "application.deploy",
        {
            "applicationId": app_id,
            "title": f"Deploy {branch}",
            "description": f"Commit: {sha}",
        },
    )
    print("Deploy triggered")
    return app_id


def verify_cdn_bundle(domain: str) -> None:
    script = REPO_ROOT / "scripts" / "verify_frontend_cdn_bundle.py"
    env = os.environ.copy()
    env["FRONTEND_URL"] = f"https://{domain}"
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=REPO_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stdout or result.stderr or "CDN bundle check failed").strip()
        raise RuntimeError(detail)


def wait_for_cdn_bundle(domain: str, timeout_sec: int = 900) -> None:
    deadline = time.time() + timeout_sec
    last_error = "timeout"

    while time.time() < deadline:
        try:
            verify_cdn_bundle(domain)
            print(f"  ✓ CDN bundle OK: https://{domain}/")
            return
        except RuntimeError as exc:
            last_error = str(exc).splitlines()[-1]
        print(f"  waiting for CDN bundle on https://{domain}/ … ({last_error})")
        time.sleep(30)

    raise RuntimeError(f"CDN bundle not ready: https://{domain}/ ({last_error})")


def wait_for_frontend(domain: str, timeout_sec: int = 900) -> None:
    url = f"https://{domain}/"
    deadline = time.time() + timeout_sec
    last_error = "timeout"

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                body = resp.read(8000).decode("utf-8", errors="replace")
                if resp.status == 200 and ("CashbackBrain" in body or "кэшб" in body.lower() or "auth" in body.lower()):
                    print(f"  ✓ Frontend OK: {url}")
                    return
                last_error = f"HTTP {resp.status}, unexpected body"
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}"
        except Exception as exc:
            last_error = str(exc)
        print(f"  waiting for {url} … ({last_error})")
        time.sleep(20)

    raise RuntimeError(f"Frontend not ready: {url} ({last_error})")


def main() -> None:
    load_dokploy_env()
    target = os.environ.get("DOKPLOY_TARGET", "").strip()
    if target:
        apply_deploy_profile(target)
    domain = os.environ.get("FRONTEND_DOMAIN", DEFAULT_DOMAIN).strip()

    client = DokployClient(require_env("DOKPLOY_URL"), require_env("DOKPLOY_API_KEY"))
    app_id = deploy_frontend(client)

    if os.environ.get("FRONTEND_WAIT_READY", "1").strip() not in ("0", "false", "no"):
        print()
        print(f"Waiting for https://{domain}/ (build ~5–10 min)…")
        try:
            wait_for_frontend(domain)
            if os.environ.get("FRONTEND_VERIFY_CDN", "1").strip() not in ("0", "false", "no"):
                print()
                print("Waiting for CDN URLs in frontend bundle…")
                wait_for_cdn_bundle(domain)
        except RuntimeError as exc:
            print(f"Warning: {exc}", file=sys.stderr)

    print()
    print("Done.")
    print(f"  Frontend: https://{domain}")
    print(f"  appId:    {app_id}")
    print()
    print("Next: python3 scripts/verify_e2e_phase5.py")


if __name__ == "__main__":
    main()
