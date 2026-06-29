#!/usr/bin/env python3
"""Complete PocketBase Phase 1: app settings, auth, CORS origins, verify catalog.

Reads credentials from .env.pocketbase (safe parsing for special chars in password).
Optionally updates Dokploy PocketBase command for --origins (requires .env.dokploy).

Usage:
  python3 scripts/setup_pocketbase_phase1.py
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
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV = REPO_ROOT / ".env.pocketbase"
DEFAULT_DOKPLOY_ENV = REPO_ROOT / ".env.dokploy"

APP_ID = os.environ.get("POCKETBASE_APP_ID", "XyZ0MqDBRS4xQQ6hmtCoJ")
APP_NAME = "CashbackBrain"
APP_URL = "https://cashbackbrain.ru"
PB_PUBLIC_URL = os.environ.get("POCKETBASE_DOMAIN", "https://pb.cashbackbrain.ru")
if not PB_PUBLIC_URL.startswith("http"):
    PB_PUBLIC_URL = f"https://{PB_PUBLIC_URL}"

CORS_ORIGINS = os.environ.get(
    "POCKETBASE_CORS_ORIGINS",
    "https://cashbackbrain.ru,https://dev.cashbackbrain.ru,http://localhost:3000,https://pb.cashbackbrain.ru",
)
AUTH_TOKEN_SECONDS = int(os.environ.get("POCKETBASE_AUTH_TOKEN_SEC", "604800"))
MIN_PASSWORD_LENGTH = 8
VERIFICATION_TOKEN_SECONDS = int(os.environ.get("POCKETBASE_VERIFICATION_TOKEN_SEC", "86400"))
RESET_PASSWORD_TOKEN_SECONDS = int(os.environ.get("POCKETBASE_RESET_TOKEN_SEC", "3600"))
REQUIRE_EMAIL_VERIFICATION = os.environ.get("POCKETBASE_REQUIRE_EMAIL_VERIFICATION", "true").lower() not in (
    "0",
    "false",
    "no",
)
EXPECTED_CATALOG_COUNT = 146

VERIFY_EMAIL_SUBJECT = "Подтвердите ваш email в CashbackBrain"
RESET_PASSWORD_SUBJECT = "Восстановление пароля в CashbackBrain"

EMAIL_BUTTON_STYLE = (
    "display:inline-block;padding:12px 24px;background:#fde68a;color:#0f172a;"
    "text-decoration:none;border-radius:12px;font-weight:600;"
)

VERIFY_EMAIL_BODY = f"""<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#334155;">
<p>Здравствуйте!</p>
<p>Спасибо за регистрацию в <strong>{{{{APP_NAME}}}}</strong>. Подтвердите email, чтобы сохранять результаты и входить в аккаунт.</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{{{APP_URL}}}}/verify-email?token={{{{TOKEN}}}}" style="{EMAIL_BUTTON_STYLE}">Подтвердить email</a>
</p>
<p style="font-size:14px;color:#64748b;">Ссылка действует 24 часа. Если вы не регистрировались — проигнорируйте письмо или напишите на <a href="mailto:support@cashbackbrain.ru">support@cashbackbrain.ru</a>.</p>
<p style="font-size:13px;color:#94a3b8;margin-top:32px;">— Команда CashbackBrain</p>
</div>"""

RESET_PASSWORD_BODY = f"""<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#334155;">
<p>Здравствуйте!</p>
<p>Мы получили запрос на сброс пароля в <strong>{{{{APP_NAME}}}}</strong>. Если это были вы — нажмите кнопку ниже.</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{{{APP_URL}}}}/reset-password?token={{{{TOKEN}}}}" style="{EMAIL_BUTTON_STYLE}">Сбросить пароль</a>
</p>
<p style="font-size:14px;color:#64748b;">Ссылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо.</p>
<p style="font-size:13px;color:#94a3b8;margin-top:32px;">— Команда CashbackBrain</p>
</div>"""


def load_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise SystemExit(f"Env file not found: {path}")
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def _ssl_context(verify: bool) -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if not verify:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


class PocketBaseClient:
    def __init__(self, base_url: str, email: str, password: str, verify_ssl: bool) -> None:
        self._base = base_url.rstrip("/")
        self._verify_ssl = verify_ssl
        self._token = self._login(email, password)

    def _login(self, email: str, password: str) -> str:
        payload = json.dumps({"identity": email, "password": password}).encode()
        req = urllib.request.Request(
            f"{self._base}/api/collections/_superusers/auth-with-password",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30, context=_ssl_context(not self._verify_ssl)) as resp:
            data = json.loads(resp.read())
        token = data.get("token")
        if not token:
            raise RuntimeError("Superuser login failed: no token")
        return str(token)

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        url = f"{self._base}{path}"
        headers = {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=60, context=_ssl_context(not self._verify_ssl)) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}

    def patch_settings(self) -> None:
        current = self.request("GET", "/api/settings")
        meta = current.get("meta", {})
        meta.update(
            {
                "appName": APP_NAME,
                "appURL": APP_URL,
                "senderName": APP_NAME,
                "senderAddress": meta.get("senderAddress") or "noreply@cashbackbrain.ru",
            }
        )
        self.request("PATCH", "/api/settings", {"meta": meta})
        print(f"  ✓ settings: appName={APP_NAME}, appURL={APP_URL}")

    def patch_users_auth(self) -> None:
        users = self.request("GET", "/api/collections/users")
        password_field = next((f for f in users.get("fields", []) if f.get("name") == "password"), None)
        if password_field and password_field.get("min") != MIN_PASSWORD_LENGTH:
            password_field["min"] = MIN_PASSWORD_LENGTH

        body: dict[str, Any] = {
            "authRule": "",
            "authToken": {"duration": AUTH_TOKEN_SECONDS},
            "passwordAuth": {"enabled": True, "identityFields": ["email"]},
            "oauth2": {
                "enabled": False,
                "providers": [],
                "mappedFields": users.get("oauth2", {}).get("mappedFields", {}),
            },
            "mfa": {"enabled": False, "duration": 600, "rule": ""},
            "otp": {
                "enabled": False,
                "duration": 180,
                "length": 8,
                "emailTemplate": users.get("otp", {}).get("emailTemplate", {}),
            },
            "verification": {
                "enabled": True,
                "duration": VERIFICATION_TOKEN_SECONDS,
                "emailTemplate": {
                    "subject": VERIFY_EMAIL_SUBJECT,
                    "body": VERIFY_EMAIL_BODY,
                },
            },
            "resetPassword": {
                "enabled": True,
                "duration": RESET_PASSWORD_TOKEN_SECONDS,
                "emailTemplate": {
                    "subject": RESET_PASSWORD_SUBJECT,
                    "body": RESET_PASSWORD_BODY,
                },
            },
        }

        options = users.get("options") or {}
        options["onlyVerified"] = REQUIRE_EMAIL_VERIFICATION
        options["minPasswordLength"] = MIN_PASSWORD_LENGTH
        body["options"] = options

        if password_field:
            body["fields"] = users["fields"]

        self.request("PATCH", "/api/collections/users", body)
        verified_label = "on" if REQUIRE_EMAIL_VERIFICATION else "off"
        print(
            f"  ✓ auth: min password {MIN_PASSWORD_LENGTH}, token {AUTH_TOKEN_SECONDS}s, "
            f"email verification {verified_label}, "
            f"verification TTL {VERIFICATION_TOKEN_SECONDS}s, reset TTL {RESET_PASSWORD_TOKEN_SECONDS}s"
        )

    def verify_catalog(self) -> int:
        data = self.request("GET", "/api/collections/retailer_catalog/records?perPage=1")
        total = int(data.get("totalItems", 0))
        print(f"  ✓ retailer_catalog records: {total}")
        if total < EXPECTED_CATALOG_COUNT:
            raise RuntimeError(
                f"Expected at least {EXPECTED_CATALOG_COUNT} retailer_catalog records, got {total}"
            )
        return total

    def verify_collections(self) -> None:
        data = self.request("GET", "/api/collections?perPage=200")
        names = {item["name"] for item in data.get("items", [])}
        for required in ("retailer_catalog", "saved_matrices", "users"):
            if required not in names:
                raise RuntimeError(f"Missing collection: {required}")
        print("  ✓ collections: retailer_catalog, saved_matrices, users")


class DokployClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"x-api-key": api_key, "Content-Type": "application/json"}

    def post(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self._base}/api/{path}"
        body = json.dumps(payload or {}).encode()
        req = urllib.request.Request(url, data=body, headers=self._headers, method="POST")
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else True


def configure_cors_on_dokploy(origins: str) -> None:
    if not DEFAULT_DOKPLOY_ENV.is_file():
        print("  ~ CORS: .env.dokploy not found — skip Dokploy --origins update")
        print(f"    (PocketBase default allows all origins; recommended: {origins})")
        return

    env = load_env_file(DEFAULT_DOKPLOY_ENV)
    dokploy_url = env.get("DOKPLOY_URL", "").strip()
    dokploy_key = env.get("DOKPLOY_API_KEY", "").strip()
    if not dokploy_url or not dokploy_key:
        print("  ~ CORS: incomplete .env.dokploy — skip Dokploy update")
        return

    client = DokployClient(dokploy_url, dokploy_key)
    command = (
        f"/pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data "
        f"--origins={origins}"
    )

    try:
        client.post(
            "application.update",
            {"applicationId": APP_ID, "sourceType": "docker", "command": command},
        )
        client.post("application.deploy", {"applicationId": APP_ID})
        print(f"  ✓ CORS origins via Dokploy command: {origins}")
        print("    waiting 45s for redeploy...")
        time.sleep(45)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        print(f"  ~ CORS Dokploy update failed ({exc.code}): {detail}")
        print("    PocketBase still allows all origins by default.")


def main() -> int:
    env_path = Path(os.environ.get("POCKETBASE_ENV_FILE", DEFAULT_ENV))
    env = load_env_file(env_path)

    base_url = env.get("POCKETBASE_URL", "").strip()
    email = env.get("POCKETBASE_ADMIN_EMAIL", "").strip()
    password = env.get("POCKETBASE_ADMIN_PASSWORD", "").strip()
    verify_ssl = env.get("POCKETBASE_SSL_VERIFY", "true").lower() not in ("0", "false", "no")

    if not base_url or not email or not password:
        raise SystemExit("POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD required")

    print(f"PocketBase Phase 1 setup → {base_url}")

    pb = PocketBaseClient(base_url, email, password, verify_ssl)
    pb.patch_settings()
    pb.patch_users_auth()
    pb.verify_collections()
    pb.verify_catalog()
    configure_cors_on_dokploy(CORS_ORIGINS)

    print()
    print("Phase 1 complete.")
    print(f"  Admin UI: {base_url}/_/")
    print(f"  Health:   {base_url}/api/health")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
