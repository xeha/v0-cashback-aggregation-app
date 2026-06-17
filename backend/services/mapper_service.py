import json
from pathlib import Path
from typing import Literal

import numpy as np
from sentence_transformers import SentenceTransformer

from schemas import CategoryMapRequestItem, MappedItem
from services.bank_slug_resolver import load_bank_aliases, resolve_bank_slug

HIERARCHY_PATH = Path(__file__).resolve().parent.parent / "data" / "category_hierarchy.json"
OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "category_overrides.json"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_category_catalog.json"
NAMED_CATEGORIES_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "bank_named_categories.json"
)
PARENT_SYNONYMS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "parent_category_synonyms.json"
)
BANK_OFFER_ENTRIES_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "bank_offer_entries.json"
)
FALLBACK_SUBCATEGORY = "Прочее (УСЛУГИ)"
FALLBACK_PARENT = "Услуги"
DEFAULT_THRESHOLD = 0.45
CONFIDENCE_OVERRIDE = 1.0


def _normalize_category_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _load_bank_offer_keys() -> dict[str, set[str]]:
    if not BANK_OFFER_ENTRIES_PATH.is_file():
        return {}
    raw = json.loads(BANK_OFFER_ENTRIES_PATH.read_text(encoding="utf-8"))
    return {
        slug: {_normalize_category_name(key) for key in keys}
        for slug, keys in raw.items()
    }


def _load_named_categories() -> dict[str, dict[str, str]]:
    if not NAMED_CATEGORIES_PATH.is_file():
        return {}
    raw = json.loads(NAMED_CATEGORIES_PATH.read_text(encoding="utf-8"))
    return {_normalize_category_name(key): value for key, value in raw.items()}


def _is_bank_offer(bank_slug: str | None, normalized_raw: str, offer_keys: dict[str, set[str]]) -> bool:
    if not bank_slug:
        return False
    return normalized_raw in offer_keys.get(bank_slug, set())


def _catalog_unified(entry: dict) -> str | None:
    return entry.get("unified_subcategory") or entry.get("unified")


def _catalog_signature(entry: dict) -> tuple[str, str | None, bool] | None:
    sub = _catalog_unified(entry)
    if not sub:
        return None
    parent = entry.get("unified_parent")
    is_macro = bool(entry.get("is_macro")) or (
        parent is not None and _normalize_category_name(sub) == _normalize_category_name(parent)
    )
    return sub, parent, is_macro


def _build_catalog_indexes(
    catalog: dict[str, dict[str, dict]],
) -> tuple[dict[str, list[tuple[str, dict]]], dict[str, dict]]:
    by_key: dict[str, list[tuple[str, dict]]] = {}
    consensus: dict[str, dict] = {}

    for slug, entries in catalog.items():
        for key, entry in entries.items():
            if _catalog_signature(entry) is None:
                continue
            by_key.setdefault(key, []).append((slug, entry))

    for key, pairs in by_key.items():
        signatures: dict[tuple[str, str | None, bool], list[tuple[str, dict]]] = {}
        for slug, entry in pairs:
            signature = _catalog_signature(entry)
            if signature is None:
                continue
            signatures.setdefault(signature, []).append((slug, entry))
        if len(signatures) == 1:
            consensus[key] = next(iter(signatures.values()))[0][1]

    return by_key, consensus


class MapperService:
    def __init__(self) -> None:
        self._model: SentenceTransformer | None = None
        self._subcategories: list[str] = []
        self._subcategory_embeddings: np.ndarray | None = None
        self._subcategory_to_parent: dict[str, str] = {}
        self._normalized_to_parent: dict[str, str] = {}
        self._overrides: dict[str, str] = {}
        self._named_categories: dict[str, dict[str, str]] = {}
        self._parent_synonyms: dict[str, str] = {}
        self._catalog: dict[str, dict[str, dict]] = {}
        self._catalog_by_key: dict[str, list[tuple[str, dict]]] = {}
        self._catalog_consensus: dict[str, dict] = {}
        self._bank_aliases: dict[str, str] = {}
        self._bank_offer_keys: dict[str, set[str]] = {}
        self._threshold = float(
            __import__("os").environ.get("CATEGORY_MAP_THRESHOLD", DEFAULT_THRESHOLD)
        )

    @property
    def is_loaded(self) -> bool:
        return self._model is not None and self._subcategory_embeddings is not None

    def load(self) -> None:
        hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
        self._subcategories = hierarchy["subcategory_names"]
        self._subcategory_to_parent = hierarchy["subcategory_to_parent"]
        self._normalized_to_parent = {
            _normalize_category_name(parent["name"]): parent["name"]
            for parent in hierarchy.get("parents", [])
        }

        with OVERRIDES_PATH.open(encoding="utf-8") as f:
            raw_overrides = json.load(f)
        self._overrides = {
            _normalize_category_name(key): value for key, value in raw_overrides.items()
        }
        self._named_categories = _load_named_categories()
        if PARENT_SYNONYMS_PATH.is_file():
            raw_synonyms = json.loads(PARENT_SYNONYMS_PATH.read_text(encoding="utf-8"))
            self._parent_synonyms = {
                _normalize_category_name(key): value for key, value in raw_synonyms.items()
            }

        with CATALOG_PATH.open(encoding="utf-8") as f:
            self._catalog = json.load(f)
        self._catalog_by_key, self._catalog_consensus = _build_catalog_indexes(self._catalog)
        self._bank_aliases = load_bank_aliases()
        self._bank_offer_keys = _load_bank_offer_keys()

        model_name = __import__("os").environ.get(
            "SENTENCE_TRANSFORMER_MODEL",
            "paraphrase-multilingual-MiniLM-L12-v2",
        )
        self._model = SentenceTransformer(model_name)
        self._subcategory_embeddings = self._model.encode(
            self._subcategories,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    def _resolve_parent(self, subcategory: str) -> str:
        return self._subcategory_to_parent.get(
            _normalize_category_name(subcategory),
            FALLBACK_PARENT,
        )

    def _is_macro_subcategory(self, subcategory: str, parent: str) -> bool:
        return _normalize_category_name(subcategory) == _normalize_category_name(parent)

    def _lookup_catalog_entry(self, normalized: str, bank_slug: str | None) -> dict | None:
        pairs = self._catalog_by_key.get(normalized)
        if not pairs:
            return None

        if normalized in self._catalog_consensus:
            return self._catalog_consensus[normalized]

        if bank_slug:
            for slug, entry in pairs:
                if slug == bank_slug and _catalog_unified(entry):
                    return entry

        signature_counts: dict[tuple[str, str | None, bool], int] = {}
        signature_entry: dict[tuple[str, str | None, bool], dict] = {}
        for _, entry in pairs:
            signature = _catalog_signature(entry)
            if signature is None:
                continue
            signature_counts[signature] = signature_counts.get(signature, 0) + 1
            signature_entry.setdefault(signature, entry)

        if signature_counts:
            best_signature = max(signature_counts, key=signature_counts.get)
            return signature_entry[best_signature]

        return None

    def _mapped_item(
        self,
        item: CategoryMapRequestItem,
        subcategory: str,
        confidence: float,
        bank_slug: str | None,
        normalized: str,
        match_source: Literal[
            "catalog", "override", "parent", "named", "embedding", "fallback"
        ],
        *,
        parent: str | None = None,
        is_macro_category: bool = False,
    ) -> MappedItem:
        resolved_parent = parent or self._resolve_parent(subcategory)
        is_macro = is_macro_category or self._is_macro_subcategory(subcategory, resolved_parent)
        return MappedItem(
            raw_category=item.raw_category,
            unified_category=subcategory,
            unified_subcategory=subcategory,
            unified_parent=resolved_parent,
            rate=item.rate,
            confidence=confidence,
            is_bank_offer=_is_bank_offer(bank_slug, normalized, self._bank_offer_keys),
            is_macro_category=is_macro,
            match_source=match_source,
        )

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None = None,
    ) -> list[MappedItem]:
        if not self.is_loaded or self._model is None or self._subcategory_embeddings is None:
            raise RuntimeError("Mapper model is not loaded")

        if not items:
            return []

        queries = [item.raw_category for item in items]
        query_embeddings = self._model.encode(
            queries,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        mapped: list[MappedItem] = []
        bank_slug = resolve_bank_slug(source_name, self._bank_aliases)
        pending: list[tuple[CategoryMapRequestItem, np.ndarray]] = []

        for item, query_embedding in zip(items, query_embeddings):
            normalized = _normalize_category_name(item.raw_category)

            entry = self._lookup_catalog_entry(normalized, bank_slug)
            if entry:
                sub = _catalog_unified(entry)
                parent = entry.get("unified_parent")
                signature = _catalog_signature(entry)
                is_macro = signature[2] if signature else False
                if sub:
                    mapped.append(
                        self._mapped_item(
                            item,
                            sub,
                            CONFIDENCE_OVERRIDE,
                            bank_slug,
                            normalized,
                            "catalog",
                            parent=parent,
                            is_macro_category=is_macro,
                        )
                    )
                    continue

            named = self._named_categories.get(normalized)
            if named:
                parent = named["parent"]
                mapped.append(
                    self._mapped_item(
                        item,
                        item.raw_category.strip(),
                        CONFIDENCE_OVERRIDE,
                        bank_slug,
                        normalized,
                        "named",
                        parent=parent,
                        is_macro_category=True,
                    )
                )
                continue

            parent_macro = self._parent_synonyms.get(normalized) or self._normalized_to_parent.get(
                normalized
            )
            if parent_macro:
                mapped.append(
                    self._mapped_item(
                        item,
                        parent_macro,
                        CONFIDENCE_OVERRIDE,
                        bank_slug,
                        normalized,
                        "parent",
                        parent=parent_macro,
                        is_macro_category=True,
                    )
                )
                continue

            override = self._overrides.get(normalized)
            if override:
                mapped.append(
                    self._mapped_item(
                        item,
                        override,
                        CONFIDENCE_OVERRIDE,
                        bank_slug,
                        normalized,
                        "override",
                    )
                )
                continue

            pending.append((item, query_embedding))

        for item, query_embedding in pending:
            normalized = _normalize_category_name(item.raw_category)
            similarities = np.dot(self._subcategory_embeddings, query_embedding)
            best_idx = int(np.argmax(similarities))
            confidence = float(similarities[best_idx])
            if confidence >= self._threshold:
                subcategory = self._subcategories[best_idx]
                match_source: Literal["embedding", "fallback"] = "embedding"
            else:
                subcategory = FALLBACK_SUBCATEGORY
                match_source = "fallback"
            mapped.append(
                self._mapped_item(
                    item,
                    subcategory,
                    round(confidence, 4),
                    bank_slug,
                    normalized,
                    match_source,
                )
            )

        return mapped
