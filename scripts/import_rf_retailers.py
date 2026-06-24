#!/usr/bin/env python3
"""Import rf_retailers.json into PocketBase retailer_catalog collection."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT.parent / "rf_retailers.json"

SECTION_TO_PARENT: dict[str, str] = {
    "FMCG — Продукты питания и товары повседневного спроса": "Продукты И Напитки",
    "Fashion — Одежда": "Одежда И Обувь",
    "БиКТ — Бытовая техника, электроника, мобильные устройства": "Техника И Электроника",
    "Детские товары и одежда": "Для Детей",
    "Косметика, парфюмерия и дрогери": "Косметика И Парфюмерия",
    "DIY & Household — Стройматериалы, ремонт, товары для дома": "Дом И Интерьер",
    "Аптеки и здоровье": "Медицина И Здоровье",
    "Спорт и активный отдых": "Спорт И Активный Отдых",
    "Обувь": "Одежда И Обувь",
    "Зоотовары": "Питомцам",
    "Ювелирные украшения": "Подарки",
    "Универсальные маркетплейсы (онлайн)": "Супермаркеты И Маркетплейсы",
}

LEGAL_SUFFIX_RE = re.compile(
    r"\s*[\(\[]\s*(?:ооо|ао|пао|зао|ип|x5 group|магнит)[^)\]]*[\)\]]",
    re.IGNORECASE,
)


def normalize_retailer_name(name: str) -> str:
    cleaned = LEGAL_SUFFIX_RE.sub("", name)
    cleaned = cleaned.split("—")[0].split("-")[0].strip()
    return " ".join(cleaned.lower().split())


def canonical_name(name: str) -> str:
    cleaned = LEGAL_SUFFIX_RE.sub("", name)
    return cleaned.split("(")[0].strip()


def import_retailers(source_path: Path) -> dict:
    rows = json.loads(source_path.read_text(encoding="utf-8"))
    entries: dict[str, dict] = {}
    for row in rows:
        section = row["section"]
        parent = SECTION_TO_PARENT.get(section)
        if not parent:
            raise KeyError(f"Unknown section: {section!r}")
        retailer = row["retailer"]
        key = normalize_retailer_name(retailer)
        if not key:
            continue
        entries[key] = {
            "unified_parent": parent,
            "unified_subcategory": row.get("segment") or parent,
            "canonical_name": canonical_name(retailer),
            "source": "static",
            "rf_section": section,
        }
    return {"version": "1.0", "entries": entries}


def _pocketbase_url() -> str:
    raw = os.environ.get("POCKETBASE_URL", "").strip()
    if not raw:
        raise RuntimeError("POCKETBASE_URL is not configured")
    return raw.rstrip("/")


def _admin_credentials() -> tuple[str, str]:
    email = os.environ.get("POCKETBASE_ADMIN_EMAIL", "").strip()
    password = os.environ.get("POCKETBASE_ADMIN_PASSWORD", "").strip()
    if not email or not password:
        raise RuntimeError("POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD is not configured")
    return email, password


def _admin_token(client: httpx.Client, base_url: str) -> str:
    email, password = _admin_credentials()
    response = client.post(
        f"{base_url}/api/admins/auth-with-password",
        json={"identity": email, "password": password},
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("PocketBase admin auth succeeded without token")
    return str(token)


def _request_with_admin_auth(
    client: httpx.Client,
    *,
    method: str,
    url: str,
    token: str,
    json_payload: dict,
) -> None:
    response = client.request(
        method,
        url,
        json=json_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    response.raise_for_status()


def _fetch_existing_records(client: httpx.Client, base_url: str, token: str) -> dict[str, str]:
    page = 1
    per_page = 500
    existing: dict[str, str] = {}
    while True:
        response = client.get(
            f"{base_url}/api/collections/retailer_catalog/records",
            params={
                "page": page,
                "perPage": per_page,
                "fields": "id,key",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        payload = response.json()
        items = payload.get("items", [])
        for item in items:
            key = str(item.get("key", "")).strip()
            record_id = str(item.get("id", "")).strip()
            if key and record_id:
                existing[key] = record_id
        total_items = int(payload.get("totalItems", len(items)))
        if page * per_page >= total_items:
            break
        page += 1
    return existing


def upsert_catalog_to_pocketbase(catalog: dict) -> tuple[int, int]:
    base_url = _pocketbase_url()
    created = 0
    updated = 0
    entries = catalog.get("entries", {})

    with httpx.Client(timeout=20.0) as client:
        token = _admin_token(client, base_url)
        existing_by_key = _fetch_existing_records(client, base_url, token)

        for key, row in entries.items():
            payload = {
                "key": key,
                "unified_parent": row["unified_parent"],
                "unified_subcategory": row["unified_subcategory"],
                "canonical_name": row["canonical_name"],
                "source": row.get("source", "static"),
                "rf_section": row.get("rf_section"),
            }
            record_id = existing_by_key.get(key)
            if record_id:
                _request_with_admin_auth(
                    client,
                    method="PATCH",
                    url=f"{base_url}/api/collections/retailer_catalog/records/{record_id}",
                    token=token,
                    json_payload=payload,
                )
                updated += 1
                continue

            _request_with_admin_auth(
                client,
                method="POST",
                url=f"{base_url}/api/collections/retailer_catalog/records",
                token=token,
                json_payload=payload,
            )
            created += 1

    return created, updated


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.is_file():
        print(f"Source not found: {source}", file=sys.stderr)
        return 1
    catalog = import_retailers(source)
    created, updated = upsert_catalog_to_pocketbase(catalog)
    print(
        f"PocketBase upsert complete: created={created}, updated={updated}, total={len(catalog['entries'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
