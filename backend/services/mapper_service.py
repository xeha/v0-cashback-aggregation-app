import json
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

from schemas import CategoryMapRequestItem, MappedItem
from services.bank_slug_resolver import load_bank_aliases, resolve_bank_slug

TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "data" / "taxonomy.json"
OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "category_overrides.json"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_category_catalog.json"
FALLBACK_CATEGORY = "Прочее"
DEFAULT_THRESHOLD = 0.45
CONFIDENCE_OVERRIDE = 1.0


def _normalize_category_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


class MapperService:
    def __init__(self) -> None:
        self._model: SentenceTransformer | None = None
        self._taxonomy: list[str] = []
        self._taxonomy_embeddings: np.ndarray | None = None
        self._overrides: dict[str, str] = {}
        self._catalog: dict[str, dict[str, dict]] = {}
        self._bank_aliases: dict[str, str] = {}
        self._threshold = float(
            __import__("os").environ.get("CATEGORY_MAP_THRESHOLD", DEFAULT_THRESHOLD)
        )

    @property
    def is_loaded(self) -> bool:
        return self._model is not None and self._taxonomy_embeddings is not None

    def load(self) -> None:
        with TAXONOMY_PATH.open(encoding="utf-8") as f:
            self._taxonomy = json.load(f)

        with OVERRIDES_PATH.open(encoding="utf-8") as f:
            raw_overrides = json.load(f)
        self._overrides = {
            _normalize_category_name(key): value for key, value in raw_overrides.items()
        }

        with CATALOG_PATH.open(encoding="utf-8") as f:
            self._catalog = json.load(f)
        self._bank_aliases = load_bank_aliases()

        model_name = __import__("os").environ.get(
            "SENTENCE_TRANSFORMER_MODEL",
            "paraphrase-multilingual-MiniLM-L12-v2",
        )
        self._model = SentenceTransformer(model_name)
        self._taxonomy_embeddings = self._model.encode(
            self._taxonomy,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None = None,
    ) -> list[MappedItem]:
        if not self.is_loaded or self._model is None or self._taxonomy_embeddings is None:
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

            if bank_slug:
                entry = self._catalog.get(bank_slug, {}).get(normalized)
                unified = entry.get("unified") if entry else None
                if unified:
                    mapped.append(
                        MappedItem(
                            raw_category=item.raw_category,
                            unified_category=unified,
                            rate=item.rate,
                            confidence=CONFIDENCE_OVERRIDE,
                        )
                    )
                    continue

            override = self._overrides.get(normalized)
            if override:
                mapped.append(
                    MappedItem(
                        raw_category=item.raw_category,
                        unified_category=override,
                        rate=item.rate,
                        confidence=CONFIDENCE_OVERRIDE,
                    )
                )
                continue

            pending.append((item, query_embedding))

        for item, query_embedding in pending:
            similarities = np.dot(self._taxonomy_embeddings, query_embedding)
            best_idx = int(np.argmax(similarities))
            confidence = float(similarities[best_idx])
            unified = (
                self._taxonomy[best_idx]
                if confidence >= self._threshold
                else FALLBACK_CATEGORY
            )
            mapped.append(
                MappedItem(
                    raw_category=item.raw_category,
                    unified_category=unified,
                    rate=item.rate,
                    confidence=round(confidence, 4),
                )
            )

        return mapped
