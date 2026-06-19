from __future__ import annotations

import json
import os
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from schemas import CategoryMapRequestItem, MappedItem
from services.reference_hierarchy import (
    REFERENCE_HIERARCHY_PATH,
    ReferenceHierarchy,
    resolve_display_node,
)

if TYPE_CHECKING:
    from mistralai.client import Mistral

ReferenceMatchSource = Literal[
    "reference_llm",
    "reference_cache",
    "reference_fallback",
]

REFERENCE_MAP_PROMPT = """Ты классификатор категорий кэшбэка супермаркетов.
Для каждой строки выбери ОДИН узел из эталонной иерархии продуктов.
Отвечай строго по списку node_id без выдумывания.

Правила глубины (depth):
- 1 = отдел (L1): только если формулировка охватывает весь отдел
- 2 = категория (L2): жаргон и сетевые группировки
- 3 = подкатегория (L3): только если формулировка явно узкая
- Не углубляйся дальше, чем позволяет формулировка

Супермаркет: {source_name}

Строки:
{item_lines}

Узлы (node_id | полный путь):
{node_lines}

Примеры:
- "Кисломолочка" -> d04.c02, depth 2
- "Молоко сыр яйца" -> d04, depth 1
- "Молоко" -> d04.c01.s01, depth 3
- "Сливки" -> d04.c01, depth 2
- "Шоколад конфеты сладости" -> d11.c01, depth 2
- "Пиво" -> d09.c06.s02, depth 3
- "Сидр" -> d09.c06.s15, depth 3

Пиво, сидр, вино, водка и другой алкоголь — категория d09.c06 «Алкогольные напитки» (depth 2–3), не весь отдел d09 «Напитки».

Верни ТОЛЬКО JSON:
{{"items":[{{"raw":"...","node_id":"d04.c02","depth":2,"confidence":0.95}}]}}
"""

_JSON_FENCE_PREFIX_RE = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_JSON_FENCE_SUFFIX_RE = re.compile(r"\s*```$")


def _normalize_key(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _is_truthy_env(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).lower() in {"1", "true", "yes"}


def _parse_batch_size() -> int:
    raw_value = os.environ.get("REFERENCE_MAP_BATCH_SIZE", "30")
    try:
        return max(int(raw_value), 1)
    except ValueError:
        return 30


@dataclass(frozen=True)
class ClassifyResult:
    node_id: str
    depth: int
    confidence: float


class ReferenceMapperService:
    def __init__(self) -> None:
        self._hierarchy = ReferenceHierarchy()
        self._client: Any | None = None
        self._flat_paths: list[str] = []
        self._cache: dict[tuple[str, str], ClassifyResult] = {}

    @property
    def is_loaded(self) -> bool:
        return self._hierarchy.is_loaded and bool(self._flat_paths)

    def load(self) -> None:
        self._hierarchy.load()
        self._flat_paths = self._build_flat_paths()

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None,
        normalized_by_item: list[str],
    ) -> list[MappedItem]:
        if not self.is_loaded:
            raise RuntimeError("Reference mapper is not loaded")
        if not _is_truthy_env("REFERENCE_MAP_LLM_ENABLED", "true"):
            raise RuntimeError("REFERENCE_MAP_LLM_ENABLED=false")
        if not items:
            return []
        if len(items) != len(normalized_by_item):
            raise ValueError("normalized_by_item length must match items")

        source_key = _normalize_key(source_name or "")
        mapped_results: list[MappedItem | None] = [None] * len(items)
        uncached: list[tuple[int, CategoryMapRequestItem, str, str]] = []

        for index, item in enumerate(items):
            normalized = normalized_by_item[index].strip() or item.raw_category
            normalized_key = _normalize_key(normalized)
            cache_key = (normalized_key, source_key)
            cached = self._cache.get(cache_key)
            if cached is not None:
                mapped_results[index] = self._mapped_item_from_result(
                    item=item,
                    normalized=normalized,
                    result=cached,
                    match_source="reference_cache",
                )
                continue
            uncached.append((index, item, normalized, normalized_key))

        batch_size = _parse_batch_size()
        for offset in range(0, len(uncached), batch_size):
            batch = uncached[offset : offset + batch_size]
            try:
                classified = self._classify_batch(batch, source_name)
            except Exception as exc:
                print(f"reference map: LLM batch failed ({len(batch)} items): {exc}")
                classified = [None for _ in batch]
            for pending, raw_result in zip(batch, classified):
                index, item, normalized, normalized_key = pending
                resolved_result, result_source = self._resolve_result(raw_result)
                self._cache[(normalized_key, source_key)] = resolved_result
                mapped_results[index] = self._mapped_item_from_result(
                    item=item,
                    normalized=normalized,
                    result=resolved_result,
                    match_source=result_source,
                )

        return [mapped for mapped in mapped_results if mapped is not None]

    def _fallback_result(self) -> ClassifyResult:
        return ClassifyResult(
            node_id=self._hierarchy.fallback_node_id,
            depth=2,
            confidence=0.55,
        )

    def _resolve_result(
        self, raw_result: ClassifyResult | None
    ) -> tuple[ClassifyResult, ReferenceMatchSource]:
        if raw_result is None:
            return self._fallback_result(), "reference_fallback"
        if raw_result.depth not in (1, 2, 3):
            return self._fallback_result(), "reference_fallback"
        if raw_result.confidence < 0.5:
            return self._fallback_result(), "reference_fallback"
        if self._hierarchy.get_node(raw_result.node_id) is None:
            return self._fallback_result(), "reference_fallback"
        return raw_result, "reference_llm"

    def _build_flat_paths(self) -> list[str]:
        raw_data = json.loads(REFERENCE_HIERARCHY_PATH.read_text(encoding="utf-8"))
        lines: list[str] = []
        for department in raw_data.get("departments", []):
            department_id = str(department["id"])
            department_name = str(department["name"])
            lines.append(f"{department_id} | {department_name}")
            for category in department.get("categories", []):
                category_id = str(category["id"])
                category_name = str(category["name"])
                lines.append(f"{category_id} | {department_name} > {category_name}")
                for subcategory in category.get("subcategories", []):
                    subcategory_id = str(subcategory["id"])
                    subcategory_name = str(subcategory["name"])
                    lines.append(
                        f"{subcategory_id} | "
                        f"{department_name} > {category_name} > {subcategory_name}"
                    )
        return lines

    def _get_client(self) -> Mistral:
        if self._client is None:
            try:
                from mistralai.client import Mistral
            except ModuleNotFoundError as exc:
                raise RuntimeError(
                    "mistralai package is not installed; install backend requirements first"
                ) from exc
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                raise RuntimeError("MISTRAL_API_KEY is not configured")
            self._client = Mistral(api_key=api_key)
        return self._client

    def _classify_batch(
        self,
        batch: list[tuple[int, CategoryMapRequestItem, str, str]],
        source_name: str | None,
    ) -> list[ClassifyResult | None]:
        item_lines = "\n".join(
            f"- raw: {json.dumps(item.raw_category, ensure_ascii=False)}, "
            f"normalized: {json.dumps(normalized, ensure_ascii=False)}"
            for _, item, normalized, _ in batch
        )
        prompt = REFERENCE_MAP_PROMPT.format(
            source_name=source_name or "неизвестен",
            item_lines=item_lines,
            node_lines="\n".join(self._flat_paths),
        )

        response = self._get_client().chat.complete(
            model=os.environ.get("MISTRAL_CLASSIFIER_MODEL", "mistral-small-latest"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        data = self._parse_json(content)
        response_items = data.get("items")
        if not isinstance(response_items, list):
            return [None for _ in batch]

        bucket: dict[str, deque[dict]] = defaultdict(deque)
        for row in response_items:
            if not isinstance(row, dict):
                continue
            row_raw = str(row.get("raw", "")).strip()
            if not row_raw:
                continue
            bucket[_normalize_key(row_raw)].append(row)

        results: list[ClassifyResult | None] = []
        for _, item, _, _ in batch:
            row = None
            key = _normalize_key(item.raw_category)
            if bucket.get(key):
                row = bucket[key].popleft()
            results.append(self._to_classify_result(row))
        return results

    def _parse_json(self, content: str) -> dict:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = _JSON_FENCE_PREFIX_RE.sub("", cleaned)
            cleaned = _JSON_FENCE_SUFFIX_RE.sub("", cleaned)
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise ValueError("LLM response is not a JSON object")
        return data

    def _to_classify_result(self, row: dict | None) -> ClassifyResult | None:
        if not row:
            return None
        try:
            node_id = str(row.get("node_id", "")).strip()
            depth = int(row.get("depth", 0))
            confidence = float(row.get("confidence", 0.0))
        except (TypeError, ValueError):
            return None
        if not node_id:
            return None
        return ClassifyResult(
            node_id=node_id,
            depth=depth,
            confidence=confidence,
        )

    def _mapped_item_from_result(
        self,
        *,
        item: CategoryMapRequestItem,
        normalized: str,
        result: ClassifyResult,
        match_source: ReferenceMatchSource,
    ) -> MappedItem:
        display_node = resolve_display_node(self._hierarchy, result.node_id, result.depth)
        effective_depth = int(display_node.level)

        department_node = self._hierarchy.get_node(display_node.department_id)
        if department_node is None:
            raise RuntimeError(f"Department node {display_node.department_id!r} not found")

        category_node = None
        if effective_depth >= 2:
            if display_node.level == 2:
                category_node = display_node
            elif display_node.level == 3 and display_node.category_id:
                category_node = self._hierarchy.get_node(display_node.category_id)

        return MappedItem(
            raw_category=item.raw_category,
            normalized_raw_category=normalized,
            display_label=display_node.name,
            reference_node_id=display_node.id,
            reference_department=department_node.name,
            reference_category=category_node.name if category_node else None,
            reference_subcategory=display_node.name if effective_depth == 3 else None,
            reference_depth=effective_depth,
            unified_category=display_node.name,
            unified_parent=department_node.name,
            unified_subcategory=category_node.name if category_node else None,
            rate=item.rate,
            confidence=result.confidence,
            is_bank_offer=False,
            is_macro_category=effective_depth == 1,
            match_source=match_source,
        )
