import json
import os
from pathlib import Path
from typing import Literal

import numpy as np
from sentence_transformers import SentenceTransformer

from schemas import CategoryMapRequestItem, MappedItem
from services.category_classifier_service import CategoryClassifierService
from services.category_embedding import best_match, best_match_among, encode_texts
from services.market_slug_resolver import load_market_aliases, resolve_market_slug

HIERARCHY_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "supermarket_category_hierarchy.json"
)
OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "market_category_overrides.json"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "market_category_catalog.json"
ENRICHED_PATH = Path(__file__).resolve().parent.parent / "data" / "market_parent_enriched.json"
PARENT_SYNONYMS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "market_parent_synonyms.json"
)
FALLBACK_SUBCATEGORY = "Прочее"
FALLBACK_PARENT = "Прочее"
DEFAULT_PARENT_THRESHOLD = 0.55
DEFAULT_LEAF_THRESHOLD = 0.60
CONFIDENCE_OVERRIDE = 1.0

MatchSource = Literal[
    "catalog",
    "override",
    "parent",
    "leaf_exact",
    "parent_embedding",
    "leaf_embedding",
    "llm_parent",
    "fallback",
]


def _normalize_category_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


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


class MarketMapperService:
    def __init__(self) -> None:
        self._model: SentenceTransformer | None = None
        self._subcategories: list[str] = []
        self._subcategory_embeddings: np.ndarray | None = None
        self._subcategory_to_parent: dict[str, str] = {}
        self._normalized_to_parent: dict[str, str] = {}
        self._overrides: dict[str, str] = {}
        self._parent_synonyms: dict[str, str] = {}
        self._catalog: dict[str, dict[str, dict]] = {}
        self._catalog_by_key: dict[str, list[tuple[str, dict]]] = {}
        self._catalog_consensus: dict[str, dict] = {}
        self._market_aliases: dict[str, str] = {}
        self._classifier: CategoryClassifierService | None = None
        self._parents: list[str] = []
        self._parent_embeddings: np.ndarray | None = None
        self._parent_embedding_texts: list[str] = []
        self._parent_to_child_indices: dict[str, list[int]] = {}
        self._parent_threshold = float(
            os.environ.get("CATEGORY_PARENT_THRESHOLD", DEFAULT_PARENT_THRESHOLD)
        )
        self._leaf_threshold = float(
            os.environ.get("CATEGORY_LEAF_THRESHOLD", DEFAULT_LEAF_THRESHOLD)
        )

    @property
    def is_loaded(self) -> bool:
        return (
            self._model is not None
            and self._subcategory_embeddings is not None
            and self._parent_embeddings is not None
        )

    def load(self, model: SentenceTransformer) -> None:
        hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
        self._subcategories = hierarchy["subcategory_names"]
        self._subcategory_to_parent = hierarchy["subcategory_to_parent"]
        self._parents = [p["name"] for p in hierarchy.get("parents", [])]
        self._normalized_to_parent = {
            _normalize_category_name(parent["name"]): parent["name"]
            for parent in hierarchy.get("parents", [])
        }

        with OVERRIDES_PATH.open(encoding="utf-8") as f:
            raw_overrides = json.load(f)
        self._overrides = {
            _normalize_category_name(key): value for key, value in raw_overrides.items()
        }

        if PARENT_SYNONYMS_PATH.is_file():
            raw_synonyms = json.loads(PARENT_SYNONYMS_PATH.read_text(encoding="utf-8"))
            self._parent_synonyms = {
                _normalize_category_name(key): value for key, value in raw_synonyms.items()
            }

        with CATALOG_PATH.open(encoding="utf-8") as f:
            self._catalog = json.load(f)
        self._catalog_by_key, self._catalog_consensus = _build_catalog_indexes(self._catalog)
        self._market_aliases = load_market_aliases()

        enriched = json.loads(ENRICHED_PATH.read_text(encoding="utf-8"))
        self._parent_embedding_texts = [
            enriched[name]["embedding_text"] for name in self._parents
        ]

        self._model = model
        self._subcategory_embeddings = encode_texts(self._model, self._subcategories)
        self._parent_embeddings = encode_texts(self._model, self._parent_embedding_texts)

        self._parent_to_child_indices = {}
        for idx, leaf in enumerate(self._subcategories):
            parent = self._subcategory_to_parent.get(_normalize_category_name(leaf))
            if parent:
                self._parent_to_child_indices.setdefault(parent, []).append(idx)

        self._classifier = CategoryClassifierService(self._parents)

    def _resolve_parent(self, subcategory: str) -> str:
        return self._subcategory_to_parent.get(
            _normalize_category_name(subcategory),
            FALLBACK_PARENT,
        )

    def _is_macro_subcategory(self, subcategory: str, parent: str) -> bool:
        return _normalize_category_name(subcategory) == _normalize_category_name(parent)

    def _resolve_exact_leaf(self, normalized: str) -> str | None:
        for leaf in self._subcategories:
            if _normalize_category_name(leaf) == normalized:
                return leaf
        return None

    def _resolve_exact_parent(self, normalized: str) -> str | None:
        return self._normalized_to_parent.get(normalized)

    def _match_parent_embedding(self, query_embedding: np.ndarray) -> tuple[str | None, float]:
        if self._parent_embeddings is None:
            return None, 0.0
        idx, score = best_match(query_embedding, self._parent_embeddings)
        if idx < 0 or score < self._parent_threshold:
            return None, score
        return self._parents[idx], score

    def _match_leaf_in_parent(
        self,
        query_embedding: np.ndarray,
        parent: str,
        normalized: str,
    ) -> tuple[str | None, float, Literal["leaf_exact", "leaf_embedding"] | None]:
        if self._subcategory_embeddings is None:
            return None, 0.0, None

        exact = self._resolve_exact_leaf(normalized)
        if exact and self._resolve_parent(exact) == parent:
            return exact, 1.0, "leaf_exact"

        child_indices = self._parent_to_child_indices.get(parent, [])
        if not child_indices:
            return None, 0.0, None

        idx, score = best_match_among(
            query_embedding,
            self._subcategory_embeddings,
            child_indices,
        )
        if idx < 0 or score < self._leaf_threshold:
            return None, score, None
        return self._subcategories[idx], score, "leaf_embedding"

    def _lookup_catalog_entry(self, normalized: str, market_slug: str | None) -> dict | None:
        pairs = self._catalog_by_key.get(normalized)
        if not pairs:
            return None

        if normalized in self._catalog_consensus:
            return self._catalog_consensus[normalized]

        if market_slug:
            for slug, entry in pairs:
                if slug == market_slug and _catalog_unified(entry):
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
        match_source: MatchSource,
        *,
        parent: str | None = None,
        is_macro_category: bool = False,
    ) -> MappedItem:
        resolved_parent = parent or self._resolve_parent(subcategory)
        is_macro = is_macro_category or self._is_macro_subcategory(subcategory, resolved_parent)
        if is_macro:
            display_subcategory = resolved_parent
            display_category = resolved_parent
        else:
            display_subcategory = subcategory
            display_category = subcategory

        return MappedItem(
            raw_category=item.raw_category,
            unified_category=display_category,
            unified_subcategory=display_subcategory,
            unified_parent=resolved_parent,
            rate=item.rate,
            confidence=confidence,
            is_bank_offer=False,
            is_macro_category=is_macro,
            match_source=match_source,
        )

    def _map_single_item(
        self,
        item: CategoryMapRequestItem,
        market_slug: str | None,
        source_name: str | None = None,
    ) -> MappedItem:
        normalized = _normalize_category_name(item.raw_category)

        entry = self._lookup_catalog_entry(normalized, market_slug)
        if entry:
            sub = _catalog_unified(entry)
            parent = entry.get("unified_parent")
            signature = _catalog_signature(entry)
            is_macro = signature[2] if signature else False
            if sub:
                return self._mapped_item(
                    item,
                    sub,
                    CONFIDENCE_OVERRIDE,
                    "catalog",
                    parent=parent,
                    is_macro_category=is_macro,
                )

        parent_macro = self._parent_synonyms.get(normalized) or self._resolve_exact_parent(
            normalized
        )
        if parent_macro:
            return self._mapped_item(
                item,
                parent_macro,
                CONFIDENCE_OVERRIDE,
                "parent",
                parent=parent_macro,
                is_macro_category=True,
            )

        override = self._overrides.get(normalized)
        if override:
            return self._mapped_item(
                item,
                override,
                CONFIDENCE_OVERRIDE,
                "override",
            )

        leaf = self._resolve_exact_leaf(normalized)
        if leaf:
            return self._mapped_item(
                item,
                leaf,
                CONFIDENCE_OVERRIDE,
                "leaf_exact",
            )

        if self._model is None:
            raise RuntimeError("Market mapper model is not loaded")

        query_embedding = encode_texts(self._model, [item.raw_category])[0]

        parent, parent_score = self._match_parent_embedding(query_embedding)
        if parent:
            leaf_in_parent, leaf_score, leaf_source = self._match_leaf_in_parent(
                query_embedding,
                parent,
                normalized,
            )
            if leaf_in_parent and leaf_source:
                return self._mapped_item(
                    item,
                    leaf_in_parent,
                    round(leaf_score, 4),
                    leaf_source,
                    parent=parent,
                )
            return self._mapped_item(
                item,
                parent,
                round(parent_score, 4),
                "parent_embedding",
                parent=parent,
                is_macro_category=True,
            )

        if self._classifier:
            try:
                llm_parent, llm_conf = self._classifier.classify_parent(
                    item.raw_category,
                    source_name,
                    kind="market",
                )
                if llm_parent:
                    return self._mapped_item(
                        item,
                        llm_parent,
                        round(llm_conf, 4),
                        "llm_parent",
                        parent=llm_parent,
                        is_macro_category=True,
                    )
            except Exception as exc:
                print(f"market map: LLM classifier failed for {item.raw_category!r}: {exc}")

        return self._mapped_item(
            item,
            FALLBACK_SUBCATEGORY,
            round(parent_score, 4),
            "fallback",
            parent=FALLBACK_PARENT,
        )

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None = None,
        source_slug: str | None = None,
    ) -> list[MappedItem]:
        if not self.is_loaded:
            raise RuntimeError("Market mapper model is not loaded")

        if not items:
            return []

        market_slug = resolve_market_slug(source_name, source_slug, self._market_aliases)
        return [
            self._map_single_item(item, market_slug, source_name)
            for item in items
        ]
