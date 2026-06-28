#!/usr/bin/env python3
"""Create PocketBase collections and optionally import retailer_catalog."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = REPO_ROOT / "backend" / "data" / "retailer_catalog.json"


def _pb_url() -> str:
    raw = os.environ.get("POCKETBASE_URL", "").strip()
    if not raw:
        raise RuntimeError("POCKETBASE_URL is not configured")
    return raw.rstrip("/")


def _admin_credentials() -> tuple[str, str]:
    email = os.environ.get("POCKETBASE_ADMIN_EMAIL", "").strip()
    password = os.environ.get("POCKETBASE_ADMIN_PASSWORD", "").strip()
    if not email or not password:
        raise RuntimeError("POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are required")
    return email, password


def _admin_token(client: httpx.Client, base_url: str) -> str:
    email, password = _admin_credentials()
    # PocketBase 0.23+: admins → _superusers collection
    response = client.post(
        f"{base_url}/api/collections/_superusers/auth-with-password",
        json={"identity": email, "password": password},
    )
    response.raise_for_status()
    payload = response.json()
    token = payload.get("token")
    if not token:
        raise RuntimeError("PocketBase superuser auth succeeded without token")
    return str(token)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _list_collections(client: httpx.Client, base_url: str, token: str) -> dict[str, dict]:
    response = client.get(
        f"{base_url}/api/collections",
        params={"perPage": 200},
        headers=_auth_headers(token),
    )
    response.raise_for_status()
    items = response.json().get("items", [])
    return {str(item["name"]): item for item in items}


def _users_collection_id(collections: dict[str, dict]) -> str:
    users = collections.get("users")
    if not users or not users.get("id"):
        raise RuntimeError("Built-in users collection not found")
    return str(users["id"])


def _retailer_catalog_spec() -> dict:
    return {
        "name": "retailer_catalog",
        "type": "base",
        "fields": [
            {"name": "key", "type": "text", "required": True, "unique": True},
            {"name": "unified_parent", "type": "text", "required": True},
            {"name": "unified_subcategory", "type": "text", "required": False},
            {"name": "canonical_name", "type": "text", "required": True},
            {
                "name": "source",
                "type": "select",
                "required": True,
                "options": {"maxSelect": 1, "values": ["static", "llm_web", "manual"]},
            },
            {"name": "added_at", "type": "date", "required": False},
            {"name": "rf_section", "type": "text", "required": False},
        ],
        "listRule": "",
        "viewRule": "",
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
    }


def _saved_matrices_spec(users_collection_id: str) -> dict:
    return {
        "name": "saved_matrices",
        "type": "base",
        "fields": [
            {
                "name": "user",
                "type": "relation",
                "required": True,
                "options": {
                    "collectionId": users_collection_id,
                    "cascadeDelete": True,
                    "minSelect": None,
                    "maxSelect": 1,
                    "displayFields": None,
                },
            },
            {"name": "title", "type": "text", "required": True},
            {"name": "period_month", "type": "number", "required": False},
            {"name": "period_year", "type": "number", "required": False},
            {"name": "bank_matrix", "type": "json", "required": False},
            {"name": "market_matrix", "type": "json", "required": False},
            {"name": "submissions", "type": "json", "required": False},
            {"name": "summary", "type": "json", "required": False},
            {"name": "is_favorite", "type": "bool", "required": False},
        ],
        "listRule": "user = @request.auth.id",
        "viewRule": "user = @request.auth.id",
        "createRule": '@request.auth.id != "" && @request.body.user = @request.auth.id',
        "updateRule": "user = @request.auth.id",
        "deleteRule": "user = @request.auth.id",
    }


def _ensure_collection(
    client: httpx.Client,
    base_url: str,
    token: str,
    spec: dict,
    existing: dict[str, dict],
) -> None:
    name = spec["name"]
    if name in existing:
        print(f"  ✓ collection exists: {name}")
        return
    response = client.post(
        f"{base_url}/api/collections",
        json=spec,
        headers=_auth_headers(token),
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Failed to create {name}: {response.status_code} {response.text}")
    print(f"  + created collection: {name}")


def _load_catalog(path: Path) -> dict[str, dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("entries", {})
    if not isinstance(entries, dict):
        raise RuntimeError(f"Invalid catalog format in {path}")
    return entries


def _import_retailer_catalog(
    client: httpx.Client,
    base_url: str,
    token: str,
    catalog_path: Path,
) -> tuple[int, int]:
    entries = _load_catalog(catalog_path)
    existing_by_key: dict[str, str] = {}
    page = 1
    while True:
        response = client.get(
            f"{base_url}/api/collections/retailer_catalog/records",
            params={"page": page, "perPage": 500, "fields": "id,key"},
            headers=_auth_headers(token),
        )
        response.raise_for_status()
        payload = response.json()
        for item in payload.get("items", []):
            key = str(item.get("key", "")).strip()
            record_id = str(item.get("id", "")).strip()
            if key and record_id:
                existing_by_key[key] = record_id
        total_items = int(payload.get("totalItems", 0))
        if page * 500 >= total_items:
            break
        page += 1

    created = 0
    updated = 0
    for key, row in entries.items():
        body: dict[str, object] = {
            "key": key,
            "unified_parent": row["unified_parent"],
            "unified_subcategory": row.get("unified_subcategory") or row["unified_parent"],
            "canonical_name": row.get("canonical_name") or key,
            "source": row.get("source", "static"),
        }
        if row.get("added_at"):
            body["added_at"] = row["added_at"]
        if row.get("rf_section"):
            body["rf_section"] = row["rf_section"]

        record_id = existing_by_key.get(key)
        if record_id:
            response = client.patch(
                f"{base_url}/api/collections/retailer_catalog/records/{record_id}",
                json=body,
                headers=_auth_headers(token),
            )
            response.raise_for_status()
            updated += 1
            continue

        response = client.post(
            f"{base_url}/api/collections/retailer_catalog/records",
            json=body,
            headers=_auth_headers(token),
        )
        response.raise_for_status()
        created += 1

    return created, updated


def main() -> int:
    parser = argparse.ArgumentParser(description="Setup PocketBase collections for CashbackBrain")
    parser.add_argument(
        "--import-catalog",
        action="store_true",
        help="Import backend/data/retailer_catalog.json into retailer_catalog",
    )
    parser.add_argument(
        "--catalog-path",
        type=Path,
        default=DEFAULT_CATALOG,
        help="Path to retailer_catalog.json",
    )
    args = parser.parse_args()

    base_url = _pb_url()
    print(f"PocketBase: {base_url}")

    with httpx.Client(timeout=30.0) as client:
        health = client.get(f"{base_url}/api/health")
        health.raise_for_status()
        print("  ✓ health OK")

        token = _admin_token(client, base_url)
        collections = _list_collections(client, base_url, token)
        users_id = _users_collection_id(collections)

        print("Collections:")
        _ensure_collection(client, base_url, token, _retailer_catalog_spec(), collections)
        collections = _list_collections(client, base_url, token)
        _ensure_collection(client, base_url, token, _saved_matrices_spec(users_id), collections)

        if args.import_catalog:
            if not args.catalog_path.is_file():
                print(f"Catalog not found: {args.catalog_path}", file=sys.stderr)
                return 1
            created, updated = _import_retailer_catalog(client, base_url, token, args.catalog_path)
            print(f"Import: created={created}, updated={updated}, total={created + updated}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
