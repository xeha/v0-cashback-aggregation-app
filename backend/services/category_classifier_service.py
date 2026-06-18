from __future__ import annotations

import json
import os
import re

from mistralai.client import Mistral

BANK_CLASSIFIER_PROMPT = """Ты классификатор банковских категорий кэшбэка.
Выбери ОДНУ родительскую категорию из списка (точное имя).

Банк: {source_name}
Категория со скриншота: "{raw_category}"

Список родительских категорий:
{parent_list}

Верни ТОЛЬКО JSON: {{"parent": "<имя из списка>", "confidence": <0.0-1.0>}}
"""

MARKET_CLASSIFIER_PROMPT = """Ты классификатор категорий кэшбэка супермаркетов.
Выбери ОДНУ родительскую (L1) товарную категорию из списка (точное имя).
Учитывай смысл формулировки с экрана банка/приложения, а не навигацию конкретной сети.

Супермаркет: {source_name}
Категория со скриншота: "{raw_category}"

Список родительских категорий (L1):
{parent_list}

Примеры:
- «Кисломолочка» → «Молоко, сыр, яйца»
- «Майонез и соусы» → «Соусы»
- «Пиво и сидр» → «Алкогольные напитки»

Верни ТОЛЬКО JSON: {{"parent": "<имя из списка>", "confidence": <0.0-1.0>}}
"""


class CategoryClassifierService:
    def __init__(self, parent_names: list[str]) -> None:
        self._parents = parent_names
        self._parent_set = set(parent_names)
        self._client: Mistral | None = None

    def _get_client(self) -> Mistral:
        if self._client is None:
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                raise RuntimeError("MISTRAL_API_KEY is not configured")
            self._client = Mistral(api_key=api_key)
        return self._client

    def classify_parent(
        self,
        raw_category: str,
        source_name: str | None,
        *,
        kind: str = "bank",
    ) -> tuple[str | None, float]:
        if os.environ.get("CATEGORY_LLM_FALLBACK", "true").lower() not in {"1", "true", "yes"}:
            return None, 0.0

        parent_list = "\n".join(f"- {name}" for name in self._parents)
        template = MARKET_CLASSIFIER_PROMPT if kind == "market" else BANK_CLASSIFIER_PROMPT
        prompt = template.format(
            source_name=source_name or "неизвестен",
            raw_category=raw_category,
            parent_list=parent_list,
        )
        client = self._get_client()
        response = client.chat.complete(
            model=os.environ.get("MISTRAL_CLASSIFIER_MODEL", "mistral-small-latest"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        data = json.loads(cleaned)
        parent = str(data.get("parent", "")).strip()
        confidence = float(data.get("confidence", 0.0))
        if parent not in self._parent_set:
            return None, 0.0
        return parent, confidence
