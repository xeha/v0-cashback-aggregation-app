import json
import os
from pathlib import Path
from typing import Literal

import numpy as np
from sentence_transformers import SentenceTransformer

from schemas import CategoryMapRequestItem, MappedItem
from services.bank_slug_resolver import load_bank_aliases, resolve_bank_slug
from services.category_classifier_service import CategoryClassifierService
from services.category_embedding import best_match, best_match_among, encode_texts

HIERARCHY_PATH = Path(__file__).resolve().parent.parent / "data" / "category_hierarchy.json"
OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "category_overrides.json"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_category_catalog.json"
ENRICHED_PATH = Path(__file__).resolve().parent.parent / "data" / "parent_category_enriched.json"
NAMED_CATEGORIES_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "bank_named_categories.json"
)
# Bank-only OCR aliases → parent category (category_hierarchy.json).
# Not used for market mapping (ReferenceMapperService + reference_hierarchy.json).
BANK_PARENT_SYNONYMS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "parent_category_synonyms.json"
)
BANK_OFFER_ENTRIES_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "bank_offer_entries.json"
)
FALLBACK_SUBCATEGORY = "Прочее (УСЛУГИ)"
FALLBACK_PARENT = "Услуги"
DEFAULT_PARENT_THRESHOLD = 0.55
DEFAULT_LEAF_THRESHOLD = 0.60
CONFIDENCE_OVERRIDE = 1.0

MatchSource = Literal[
    "catalog",
    "override",
    "parent",
    "named",
    "leaf_exact",
    "parent_embedding",
    "leaf_embedding",
    "llm_parent",
    "fallback",
    "embedding",
]


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
        self._classifier: CategoryClassifierService | None = None
        self._enriched: dict[str, dict] = {}

    @property
    def is_loaded(self) -> bool:
        return (
            self._model is not None
            and self._subcategory_embeddings is not None
            and self._parent_embeddings is not None
        )

    def load(self, model: SentenceTransformer | None = None) -> None:
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
        self._named_categories = _load_named_categories()
        if BANK_PARENT_SYNONYMS_PATH.is_file():
            raw_synonyms = json.loads(BANK_PARENT_SYNONYMS_PATH.read_text(encoding="utf-8"))
            self._parent_synonyms = {
                _normalize_category_name(key): value
                for key, value in raw_synonyms.items()
                if not str(key).startswith("_")
            }

        with CATALOG_PATH.open(encoding="utf-8") as f:
            self._catalog = json.load(f)
        self._catalog_by_key, self._catalog_consensus = _build_catalog_indexes(self._catalog)
        self._bank_aliases = load_bank_aliases()
        self._bank_offer_keys = _load_bank_offer_keys()

        self._enriched = json.loads(ENRICHED_PATH.read_text(encoding="utf-8"))
        self._parent_embedding_texts = [
            self._enriched[name]["embedding_text"] for name in self._parents
        ]

        if model is not None:
            self._model = model
        else:
            model_name = os.environ.get(
                "SENTENCE_TRANSFORMER_MODEL",
                "paraphrase-multilingual-MiniLM-L12-v2",
            )
            self._model = SentenceTransformer(model_name)
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
        match_source: MatchSource,
        *,
        parent: str | None = None,
        is_macro_category: bool = False,
        source_name: str | None = None,
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
            is_bank_offer=_is_bank_offer(bank_slug, normalized, self._bank_offer_keys),
            is_macro_category=is_macro,
            match_source=match_source,
        )

    def _map_single_item(
        self,
        item: CategoryMapRequestItem,
        bank_slug: str | None,
        source_name: str | None,
    ) -> MappedItem:
        normalized = _normalize_category_name(item.raw_category)

        entry = self._lookup_catalog_entry(normalized, bank_slug)
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
                    bank_slug,
                    normalized,
                    "catalog",
                    parent=parent,
                    is_macro_category=is_macro,
                    source_name=source_name,
                )

        named = self._named_categories.get(normalized)
        if named:
            parent = named["parent"]
            return self._mapped_item(
                item,
                item.raw_category.strip(),
                CONFIDENCE_OVERRIDE,
                bank_slug,
                normalized,
                "named",
                parent=parent,
                is_macro_category=True,
                source_name=source_name,
            )

        parent_macro = self._parent_synonyms.get(normalized) or self._resolve_exact_parent(
            normalized
        )
        if parent_macro:
            return self._mapped_item(
                item,
                parent_macro,
                CONFIDENCE_OVERRIDE,
                bank_slug,
                normalized,
                "parent",
                parent=parent_macro,
                is_macro_category=True,
                source_name=source_name,
            )

        override = self._overrides.get(normalized)
        if override:
            return self._mapped_item(
                item,
                override,
                CONFIDENCE_OVERRIDE,
                bank_slug,
                normalized,
                "override",
                source_name=source_name,
            )

        leaf = self._resolve_exact_leaf(normalized)
        if leaf:
            return self._mapped_item(
                item,
                leaf,
                CONFIDENCE_OVERRIDE,
                bank_slug,
                normalized,
                "leaf_exact",
                source_name=source_name,
            )

        if self._model is None:
            raise RuntimeError("Mapper model is not loaded")

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
                    bank_slug,
                    normalized,
                    leaf_source,
                    parent=parent,
                    source_name=source_name,
                )
            return self._mapped_item(
                item,
                parent,
                round(parent_score, 4),
                bank_slug,
                normalized,
                "parent_embedding",
                parent=parent,
                is_macro_category=True,
                source_name=source_name,
            )

        if self._classifier:
            try:
                llm_parent, llm_conf = self._classifier.classify_parent(
                    item.raw_category,
                    source_name,
                )
                if llm_parent:
                    return self._mapped_item(
                        item,
                        llm_parent,
                        round(llm_conf, 4),
                        bank_slug,
                        normalized,
                        "llm_parent",
                        parent=llm_parent,
                        is_macro_category=True,
                        source_name=source_name,
                    )
            except Exception as exc:
                print(f"map: LLM classifier failed for {item.raw_category!r}: {exc}")

        return self._mapped_item(
            item,
            FALLBACK_SUBCATEGORY,
            round(parent_score, 4),
            bank_slug,
            normalized,
            "fallback",
            parent=FALLBACK_PARENT,
            source_name=source_name,
        )

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None = None,
    ) -> list[MappedItem]:
        if not self.is_loaded:
            raise RuntimeError("Mapper model is not loaded")

        if not items:
            return []

        bank_slug = resolve_bank_slug(source_name, self._bank_aliases)
        return [
            self._map_single_item(item, bank_slug, source_name)
            for item in items
        ]