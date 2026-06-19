from __future__ import annotations

import json
import os
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from schemas import CategoryMapRequestItem, MappedItem, ReferencePathNode
from services.reference_hierarchy import ReferenceHierarchy

if TYPE_CHECKING:
    from mistralai.client import Mistral

MatchSource = Literal["reference_split_llm", "reference_cache", "reference_fallback"]

PROMPT_TEMPLATE = """Ты классификатор категорий кэшбэка супермаркетов.
Для каждой строки верни массив parts: один или несколько узлов эталонной иерархии.

Правила:
- Разбивай строку на несколько частей, ТОЛЬКО если она перечисляет разные товары/категории,
  которым соответствуют РАЗНЫЕ узлы (например "Пиво и сидр" -> Пиво + Сидр).
- НЕ разбивай, если вся фраза соответствует одному узлу, включая названия отделов
  ("Мясо и птица", "Овощи и фрукты" -> один узел-отдел).
- Для каждой части выбери самый конкретный узел, оправданный формулировкой; не углубляйся дальше.
- Отвечай строго node_id из списка, без выдумывания.

Супермаркет: {source_name}

Строки:
{item_lines}

Узлы (node_id | полный путь):
{node_lines}

Примеры:
- "Пиво и сидр" -> [{{"split_text":"Пиво","node_id":"<пиво>"}},{{"split_text":"Сидр","node_id":"<сидр>"}}]
- "Молоко и сливки" -> [{{"split_text":"Молоко","node_id":"<молоко>"}},{{"split_text":"Сливки","node_id":"<сливки>"}}]
- "Мясо и птица" -> [{{"split_text":"Мясо и птица","node_id":"<отдел>"}}]
- "Кисломолочка" -> [{{"split_text":"Кисломолочка","node_id":"<кисломолочные>"}}]

Верни ТОЛЬКО JSON:
{{"items":[{{"raw":"...","parts":[{{"split_text":"...","node_id":"...","confidence":0.95}}]}}]}}
"""

_JSON_FENCE_PREFIX_RE = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_JSON_FENCE_SUFFIX_RE = re.compile(r"\s*```$")


def _normalize_key(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _is_truthy_env(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).lower() in {"1", "true", "yes"}


def _parse_batch_size() -> int:
    try:
        return max(int(os.environ.get("MARKET_MAP_BATCH_SIZE", "30")), 1)
    except ValueError:
        return 30


def _confidence_min() -> float:
    try:
        return float(os.environ.get("MARKET_MAP_CONFIDENCE_MIN", "0.5"))
    except ValueError:
        return 0.5


@dataclass(frozen=True)
class PartResult:
    split_text: str
    node_id: str
    confidence: float


class MarketSplitMapService:
    def __init__(self) -> None:
        self._hierarchy = ReferenceHierarchy()
        self._client: Any | None = None
        self._flat_paths: list[str] = []
        self._cache: dict[tuple[str, str], list[PartResult]] = {}

    @property
    def is_loaded(self) -> bool:
        return self._hierarchy.is_loaded and bool(self._flat_paths)

    def load(self, path=None) -> None:
        self._hierarchy.load(path)
        self._flat_paths = self._build_flat_paths()

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None,
        normalized_by_item: list[str],
    ) -> list[MappedItem]:
        if not self.is_loaded:
            raise RuntimeError("Market split map service is not loaded")
        if not _is_truthy_env("MARKET_SPLIT_MAP_LLM_ENABLED", "true"):
            raise RuntimeError("MARKET_SPLIT_MAP_LLM_ENABLED=false")
        if not items:
            return []
        if len(items) != len(normalized_by_item):
            raise ValueError("normalized_by_item length must match items")

        source_key = _normalize_key(source_name or "")
        parts_by_index: list[tuple[list[PartResult], MatchSource] | None] = [None] * len(items)
        uncached: list[tuple[int, CategoryMapRequestItem, str, str]] = []

        for index, item in enumerate(items):
            normalized = normalized_by_item[index].strip() or item.raw_category
            normalized_key = _normalize_key(normalized)
            cached = self._cache.get((normalized_key, source_key))
            if cached is not None:
                parts_by_index[index] = (cached, "reference_cache")
                continue
            uncached.append((index, item, normalized, normalized_key))

        batch_size = _parse_batch_size()
        for offset in range(0, len(uncached), batch_size):
            batch = uncached[offset : offset + batch_size]
            try:
                raw_by_raw = self._classify_batch(batch, source_name)
            except Exception as exc:
                print(f"market split map: LLM batch failed ({len(batch)}): {exc}")
                raw_by_raw = {}
            for index, item, _normalized, normalized_key in batch:
                raw_parts = raw_by_raw.get(item.raw_category)
                resolved = self._resolve_parts(raw_parts)
                self._cache[(normalized_key, source_key)] = resolved
                parts_by_index[index] = (resolved, "reference_split_llm")

        results: list[MappedItem] = []
        for index, item in enumerate(items):
            parts, source = parts_by_index[index]
            normalized = normalized_by_item[index].strip() or item.raw_category
            for part in parts:
                results.append(
                    self._mapped_item(item, normalized, part, source)
                )
        return results

    def _resolve_parts(self, raw_parts: list[dict] | None) -> list[PartResult]:
        if not raw_parts:
            return [self._fallback_part("")]
        min_conf = _confidence_min()
        resolved: list[PartResult] = []
        for raw in raw_parts:
            part = self._to_part(raw)
            if (
                part is None
                or part.confidence < min_conf
                or self._hierarchy.get_node(part.node_id) is None
            ):
                split_text = raw.get("split_text", "") if isinstance(raw, dict) else ""
                resolved.append(self._fallback_part(str(split_text)))
            else:
                resolved.append(part)
        return resolved

    def _fallback_part(self, split_text: str) -> PartResult:
        return PartResult(
            split_text=split_text,
            node_id=self._hierarchy.fallback_node_id,
            confidence=0.0,
        )

    def _to_part(self, raw: Any) -> PartResult | None:
        if not isinstance(raw, dict):
            return None
        try:
            node_id = str(raw.get("node_id", "")).strip()
            split_text = str(raw.get("split_text", "")).strip()
            confidence = float(raw.get("confidence", 0.0))
        except (TypeError, ValueError):
            return None
        if not node_id:
            return None
        return PartResult(split_text=split_text, node_id=node_id, confidence=confidence)

    def _mapped_item(
        self,
        item: CategoryMapRequestItem,
        normalized: str,
        part: PartResult,
        source: MatchSource,
    ) -> MappedItem:
        node = self._hierarchy.get_node(part.node_id)
        if node is None:
            node = self._hierarchy.get_node(self._hierarchy.fallback_node_id)
        if node is None:
            raise RuntimeError("Fallback node is not available")
        ancestors = self._hierarchy.ancestors_and_self(node.id)
        path = [ReferencePathNode(id=n.id, name=n.name) for n in ancestors]
        department = ancestors[0]
        category = ancestors[1] if len(ancestors) >= 2 else None
        is_department = len(ancestors) == 1
        return MappedItem(
            raw_category=item.raw_category,
            normalized_raw_category=normalized,
            split_text=part.split_text or node.name,
            display_label=node.name,
            reference_node_id=node.id,
            reference_department=department.name,
            reference_category=category.name if category else None,
            reference_subcategory=node.name if len(ancestors) >= 3 else None,
            reference_depth=node.level,
            reference_path=path,
            unified_category=node.name,
            unified_parent=department.name,
            unified_subcategory=category.name if category else None,
            rate=item.rate,
            confidence=part.confidence,
            is_bank_offer=False,
            is_macro_category=is_department,
            match_source="reference_fallback" if node.id == self._hierarchy.fallback_node_id else source,
        )

    def _build_flat_paths(self) -> list[str]:
        lines: list[str] = []
        for node in self._hierarchy.iter_nodes():
            path = " > ".join(node.path_names)
            hint = f" [{', '.join(node.examples)}]" if node.examples else ""
            lines.append(f"{node.id} | {path}{hint}")
        return lines

    def _get_client(self) -> "Mistral":
        if self._client is None:
            try:
                from mistralai.client import Mistral
            except ModuleNotFoundError as exc:
                raise RuntimeError("mistralai package is not installed") from exc
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                raise RuntimeError("MISTRAL_API_KEY is not configured")
            self._client = Mistral(api_key=api_key)
        return self._client

    def _classify_batch(
        self,
        batch: list[tuple[int, CategoryMapRequestItem, str, str]],
        source_name: str | None,
    ) -> dict[str, list[dict]]:
        item_lines = "\n".join(
            f"- raw: {json.dumps(item.raw_category, ensure_ascii=False)}, "
            f"normalized: {json.dumps(normalized, ensure_ascii=False)}"
            for _, item, normalized, _ in batch
        )
        prompt = PROMPT_TEMPLATE.format(
            source_name=source_name or "неизвестен",
            item_lines=item_lines,
            node_lines="\n".join(self._flat_paths),
        )
        response = self._get_client().chat.complete(
            model=os.environ.get("MISTRAL_CLASSIFIER_MODEL", "mistral-large-latest"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        data = self._parse_json(content)
        response_items = data.get("items")
        if not isinstance(response_items, list):
            return {}
        out: dict[str, list[dict]] = {}
        bucket: dict[str, deque[list[dict]]] = defaultdict(deque)
        for row in response_items:
            if not isinstance(row, dict):
                continue
            raw = str(row.get("raw", "")).strip()
            parts = row.get("parts")
            if not raw or not isinstance(parts, list):
                continue
            bucket[_normalize_key(raw)].append(parts)
        for _, item, _, _ in batch:
            key = _normalize_key(item.raw_category)
            if bucket.get(key):
                out[item.raw_category] = bucket[key].popleft()
        return out

    def _parse_json(self, content: str) -> dict:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = _JSON_FENCE_PREFIX_RE.sub("", cleaned)
            cleaned = _JSON_FENCE_SUFFIX_RE.sub("", cleaned)
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise ValueError("LLM response is not a JSON object")
        return data
