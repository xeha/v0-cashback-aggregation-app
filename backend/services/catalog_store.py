from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_ARCHIVE_DIR = _DATA_DIR / "archive"

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
    "market_parent_synonyms",
    "parent_category_synonyms",
    "parent_category_disambiguation",
    "bank_service_exclusions",
    "bank_offer_entries",
    "bank_named_categories",
    "edadeal_slug_aliases",
    "category_overrides",
    "taxonomy",
    "taxonomy_migration",
    "retailer_catalog",
]

_CATALOG_NAMES = list(dict.fromkeys(_CATALOG_NAMES))


def _assets_url() -> str | None:
    url = os.environ.get("ASSETS_URL", "").rstrip("/")
    return url or None


def _local_catalog_path(name: str) -> Path | None:
    for directory in (_DATA_DIR, _ARCHIVE_DIR):
        path = directory / f"{name}.json"
        if path.is_file():
            return path
    return None


def _load_one_local(name: str) -> tuple[str, Any] | None:
    path = _local_catalog_path(name)
    if path is None:
        logger.warning("Local catalog '%s' not found in %s or %s", name, _DATA_DIR, _ARCHIVE_DIR)
        return None
    return name, json.loads(path.read_text(encoding="utf-8"))


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


async def load_all() -> None:
    """Load catalogs into memory. Uses R2 when ASSETS_URL is set, else backend/data/."""
    _store.clear()

    assets_url = _assets_url()
    if assets_url:
        logger.info("Loading %d catalogs from %s...", len(_CATALOG_NAMES), assets_url)
        async with httpx.AsyncClient() as client:
            results = await asyncio.gather(*[_fetch_one(client, name) for name in _CATALOG_NAMES])
        for name, data in results:
            _store[name] = data
        logger.info("Catalogs loaded from R2: %s", list(_store.keys()))
        return

    logger.info(
        "ASSETS_URL not set — loading %d catalogs from %s",
        len(_CATALOG_NAMES),
        _DATA_DIR,
    )
    for name in _CATALOG_NAMES:
        loaded = await asyncio.to_thread(_load_one_local, name)
        if loaded is not None:
            catalog_name, data = loaded
            _store[catalog_name] = data
    logger.info("Catalogs loaded locally: %s", list(_store.keys()))


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
