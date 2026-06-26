from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIRS = (_BACKEND_ROOT / "data", _BACKEND_ROOT / "data" / "archive")

_store: dict[str, Any] = {}

_CATALOG_NAMES = [
    "bank_category_catalog",
    "market_category_catalog",
    "reference_hierarchy",
    "category_hierarchy",
    "parent_category_enriched",
    "market_parent_enriched",
    "bank_category_unified_overrides",
    "bank_aliases",
    "market_aliases",
    "market_category_overrides",
    "parent_category_synonyms",
    "parent_category_disambiguation",
    "bank_service_exclusions",
    "bank_offer_entries",
    "bank_named_categories",
    "edadeal_slug_aliases",
    "category_overrides",
    "taxonomy_migration",
    "retailer_catalog",
]

_CATALOG_NAMES = list(dict.fromkeys(_CATALOG_NAMES))


def _assets_url() -> str:
    url = os.environ.get("ASSETS_URL", "").rstrip("/")
    if not url:
        raise RuntimeError(
            "ASSETS_URL environment variable is not set. "
            "Catalogs are loaded only from Timeweb Object Storage."
        )
    return url


async def _fetch_one(client: httpx.AsyncClient, name: str) -> tuple[str, Any]:
    url = f"{_assets_url()}/catalogs/{name}.json"
    for attempt in range(3):
        try:
            resp = await client.get(url, timeout=30.0)
            resp.raise_for_status()
            return name, resp.json()
        except Exception as exc:
            if attempt == 2:
                raise RuntimeError(f"Failed to load catalog '{name}' from {url}: {exc}") from exc
            wait = 2 ** attempt
            logger.warning("Retrying %s in %ss (attempt %d/3): %s", name, wait, attempt + 1, exc)
            await asyncio.sleep(wait)
    raise RuntimeError("unreachable")


def _use_local_catalogs() -> bool:
    return os.environ.get("CATALOGS_LOCAL", "").lower() in ("1", "true", "yes")


def load_from_local() -> None:
    """Load catalogs from backend/data (and data/archive). For local dev when S3 is unreachable."""
    store: dict[str, Any] = {}
    for directory in _DATA_DIRS:
        if not directory.exists():
            continue
        for json_file in directory.glob("*.json"):
            try:
                store[json_file.stem] = json.loads(json_file.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning("Skipping %s: %s", json_file.name, exc)
    if not store:
        raise RuntimeError(f"No catalog JSON files found under {_DATA_DIRS[0]}")
    _store.clear()
    _store.update(store)
    logger.info("Catalogs loaded from local data/: %s", list(_store.keys()))


async def load_all() -> None:
    """Load catalogs from local data/ or download from Timeweb (ASSETS_URL)."""
    if _use_local_catalogs():
        await asyncio.to_thread(load_from_local)
        return
    logger.info("Loading %d catalogs from %s...", len(_CATALOG_NAMES), _assets_url())
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[_fetch_one(client, name) for name in _CATALOG_NAMES])
    _store.clear()
    for name, data in results:
        _store[name] = data
    logger.info("Catalogs loaded: %s", list(_store.keys()))


def get(name: str) -> Any:
    """Return catalog by name (filename without .json). Raises KeyError if not loaded."""
    if name not in _store:
        raise KeyError(
            f"Catalog '{name}' not found. Available: {list(_store.keys())}. "
            "Was catalog_store.load_all() called?"
        )
    return _store[name]


def loaded_names() -> list[str]:
    return list(_store.keys())
