from __future__ import annotations

import json
import os
import re
from collections import defaultdict, deque
from typing import Any

from schemas import CategoryMapRequestItem
from services.category_text_utils import normalize_key as _normalize_key
from services.category_text_utils import sanitize_raw as _sanitize_raw

_JSON_FENCE_PREFIX_RE = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_JSON_FENCE_SUFFIX_RE = re.compile(r"\s*```$")

COMPOUND_SPLIT_PROMPT = """Ты анализируешь строки категорий кэшбэка со скриншота супермаркета.
Для каждой строки реши: это одна cashback-категория или в строке перечислены несколько разных товаров?

Разделяй только если в одной строке кэшбэка явно несколько разных продуктов:
- «купаты и колбаски» → ["купаты", "колбаски"]
- «молоко, сливки» → ["молоко", "сливки"]

Не разделяй, если это единое название категории (включая «и» или запятую в официальном названии):
- «пиво и сидр» → ["пиво и сидр"]
- «мясо и птица» → ["мясо и птица"]
- «фрукты, овощи» → ["фрукты, овощи"]
- «кофе и чай» → ["кофе и чай"]

Сохраняй регистр слов как в исходной строке (после удаления процента).
Не выдумывай продукты — только части исходной формулировки.

Строки:
{item_lines}

Верни ТОЛЬКО JSON:
{{"items":[{{"raw":"исходная строка","parts":["часть1","часть2"]}}]}}
"""


def _is_truthy_env(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).lower() in {"1", "true", "yes"}


def _parse_batch_size() -> int:
    raw_value = os.environ.get("COMPOUND_SPLIT_BATCH_SIZE", "30")
    try:
        return max(int(raw_value), 1)
    except ValueError:
        return 30


def _parse_json(content: str) -> dict:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = _JSON_FENCE_PREFIX_RE.sub("", cleaned)
        cleaned = _JSON_FENCE_SUFFIX_RE.sub("", cleaned)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("LLM response is not a JSON object")
    return data


def _coerce_parts(raw: str, parts_value: object) -> list[str]:
    if not isinstance(parts_value, list):
        return [raw]
    parts = [str(part).strip() for part in parts_value if str(part).strip()]
    if not parts:
        return [raw]
    if len(parts) == 1:
        return parts
    return parts


class CategoryCompoundSplitService:
    def __init__(self) -> None:
        self._client: Any | None = None
        self._cache: dict[str, list[str]] = {}

    @property
    def is_loaded(self) -> bool:
        if not _is_truthy_env("COMPOUND_SPLIT_LLM_ENABLED", "true"):
            return True
        return bool(os.environ.get("MISTRAL_API_KEY"))

    def load(self) -> None:
        return None

    def expand_compound_items(
        self,
        items: list[CategoryMapRequestItem],
    ) -> list[CategoryMapRequestItem]:
        if not items:
            return []
        if not _is_truthy_env("COMPOUND_SPLIT_LLM_ENABLED", "true"):
            return list(items)

        expanded: list[CategoryMapRequestItem] = []
        pending: list[tuple[int, CategoryMapRequestItem, str, str]] = []
        resolved: list[list[str] | None] = [None] * len(items)

        for index, item in enumerate(items):
            sanitized, _ = _sanitize_raw(item.raw_category)
            lookup = sanitized or item.raw_category.strip() or item.raw_category
            cache_key = _normalize_key(lookup)
            cached = self._cache.get(cache_key)
            if cached is not None:
                resolved[index] = cached
                continue
            pending.append((index, item, lookup, cache_key))

        batch_size = _parse_batch_size()
        for offset in range(0, len(pending), batch_size):
            batch = pending[offset : offset + batch_size]
            try:
                batch_parts = self._split_batch(batch)
            except Exception as exc:
                print(f"compound split: LLM batch failed ({len(batch)} items): {exc}")
                batch_parts = [[lookup] for _, _, lookup, _ in batch]
            for (index, _, lookup, cache_key), parts in zip(batch, batch_parts):
                self._cache[cache_key] = parts
                resolved[index] = parts

        for index, item in enumerate(items):
            parts = resolved[index] or [_sanitize_raw(item.raw_category)[0] or item.raw_category]
            if len(parts) == 1:
                expanded.append(
                    CategoryMapRequestItem(raw_category=parts[0], rate=item.rate)
                )
                continue
            for part in parts:
                expanded.append(CategoryMapRequestItem(raw_category=part, rate=item.rate))
        return expanded

    def _get_client(self):
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

    def _split_batch(
        self,
        batch: list[tuple[int, CategoryMapRequestItem, str, str]],
    ) -> list[list[str]]:
        item_lines = "\n".join(
            f"- {json.dumps(lookup, ensure_ascii=False)}" for _, _, lookup, _ in batch
        )
        prompt = COMPOUND_SPLIT_PROMPT.format(item_lines=item_lines)
        response = self._get_client().chat.complete(
            model=os.environ.get("MISTRAL_CLASSIFIER_MODEL", "mistral-small-latest"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        data = _parse_json(content)
        response_items = data.get("items")
        if not isinstance(response_items, list):
            return [[lookup] for _, _, lookup, _ in batch]

        bucket: dict[str, deque[dict]] = defaultdict(deque)
        for row in response_items:
            if not isinstance(row, dict):
                continue
            row_raw = str(row.get("raw", "")).strip()
            if not row_raw:
                continue
            bucket[_normalize_key(row_raw)].append(row)

        results: list[list[str]] = []
        for _, item, lookup, _ in batch:
            row = None
            key = _normalize_key(lookup)
            if bucket.get(key):
                row = bucket[key].popleft()
            elif bucket.get(_normalize_key(item.raw_category)):
                row = bucket[_normalize_key(item.raw_category)].popleft()
            if row is None:
                results.append([lookup])
                continue
            results.append(_coerce_parts(lookup, row.get("parts")))
        return results


_compound_splitter: CategoryCompoundSplitService | None = None


def get_category_compound_splitter() -> CategoryCompoundSplitService:
    global _compound_splitter
    if _compound_splitter is None:
        _compound_splitter = CategoryCompoundSplitService()
        _compound_splitter.load()
    return _compound_splitter
