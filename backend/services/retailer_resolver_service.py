from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "retailer_catalog.json"

LEGAL_SUFFIX_RE = re.compile(
    r"\s*[\(\[]\s*(?:ооо|ао|пао|зао|ип|x5 group|магнит)[^)\]]*[\)\]]",
    re.IGNORECASE,
)

ENRICH_PROMPT = """Ты эксперт по розничной торговле в России.
Определи, что за магазин/сеть: "{name}".
Выбери ОДНУ родительскую категорию кэшбэка из списка (точное имя).
Подкатегорию сформулируй кратко по профилю магазина.

Список родительских категорий:
{parent_list}

Верни ТОЛЬКО JSON:
{{"unified_parent":"<имя из списка>","unified_subcategory":"<кратко>","canonical_name":"<официальное название>","confidence":<0.0-1.0>}}
"""


@dataclass(frozen=True)
class RetailerEntry:
    unified_parent: str
    unified_subcategory: str
    canonical_name: str
    source: str


class RetailerResolverService:
    def __init__(self, catalog_path: Path = CATALOG_PATH) -> None:
        self._catalog_path = catalog_path
        self._entries: dict[str, dict] = {}
        self._allowed_parents: list[str] = []
        self._loaded = False
        self._client = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @staticmethod
    def normalize(name: str) -> str:
        cleaned = LEGAL_SUFFIX_RE.sub("", name)
        cleaned = cleaned.split("—")[0].split("-")[0].strip()
        return " ".join(cleaned.lower().split())

    def set_allowed_parents(self, parents: list[str]) -> None:
        self._allowed_parents = list(parents)

    def load(self) -> None:
        if self._catalog_path.is_file():
            raw = json.loads(self._catalog_path.read_text(encoding="utf-8"))
            self._entries = raw.get("entries", {})
        else:
            self._entries = {}
        self._loaded = True

    def reload(self) -> None:
        self.load()

    def lookup(self, name: str) -> RetailerEntry | None:
        if not self._loaded:
            raise RuntimeError("RetailerResolverService is not loaded")
        key = self.normalize(name)
        row = self._entries.get(key)
        if not row:
            return None
        return RetailerEntry(
            unified_parent=row["unified_parent"],
            unified_subcategory=row.get("unified_subcategory") or row["unified_parent"],
            canonical_name=row.get("canonical_name") or name.strip(),
            source=row.get("source", "static"),
        )

    def save_entry(
        self,
        *,
        key: str,
        unified_parent: str,
        unified_subcategory: str,
        canonical_name: str,
        source: str,
    ) -> None:
        import fcntl

        self._catalog_path.parent.mkdir(parents=True, exist_ok=True)
        if self._catalog_path.is_file():
            raw = json.loads(self._catalog_path.read_text(encoding="utf-8"))
        else:
            raw = {"version": "1.0", "entries": {}}
        raw.setdefault("entries", {})[key] = {
            "unified_parent": unified_parent,
            "unified_subcategory": unified_subcategory,
            "canonical_name": canonical_name,
            "source": source,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        payload = json.dumps(raw, ensure_ascii=False, indent=2)
        with self._catalog_path.open("w", encoding="utf-8") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            fh.write(payload)
            fh.flush()
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        self._entries = raw["entries"]

    def _get_client(self):
        if self._client is None:
            from mistralai.client import Mistral

            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                raise RuntimeError("MISTRAL_API_KEY is not configured")
            self._client = Mistral(api_key=api_key)
        return self._client

    def _parse_json_response(self, content: str) -> dict:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        return json.loads(cleaned)

    def enrich_and_save(self, name: str, *, allowed_parents: list[str] | None = None) -> None:
        if not self._loaded:
            self.load()
        if self.lookup(name):
            return

        parents = allowed_parents or self._allowed_parents
        if not parents:
            logger.warning("retailer enrich skipped: allowed_parents empty for %r", name)
            return

        if os.environ.get("RETAILER_ENRICH_ENABLED", "true").lower() not in {"1", "true", "yes"}:
            return

        api_key = os.environ.get("MISTRAL_API_KEY")
        if not api_key:
            logger.warning("retailer enrich skipped: MISTRAL_API_KEY missing for %r", name)
            return

        key = self.normalize(name)
        parent_set = set(parents)

        try:
            client = self._get_client()
            prompt = ENRICH_PROMPT.format(
                name=name.strip(),
                parent_list="\n".join(f"- {parent}" for parent in parents),
            )
            response = client.chat.complete(
                model=os.environ.get("MISTRAL_RETAILER_MODEL", "mistral-small-latest"),
                messages=[{"role": "user", "content": prompt}],
                tools=[{"type": "web_search"}],
                tool_choice="auto",
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content or ""
            data = self._parse_json_response(content)
        except Exception as exc:
            logger.warning("retailer enrich failed for %r: %s", name, exc)
            return

        parent = str(data.get("unified_parent", "")).strip()
        confidence = float(data.get("confidence", 0.0))
        if parent not in parent_set or confidence < 0.6:
            logger.warning(
                "retailer enrich rejected for %r: parent=%r conf=%s",
                name,
                parent,
                confidence,
            )
            return

        subcategory = str(data.get("unified_subcategory", parent)).strip() or parent
        canonical = str(data.get("canonical_name", name)).strip() or name.strip()
        try:
            self.save_entry(
                key=key,
                unified_parent=parent,
                unified_subcategory=subcategory,
                canonical_name=canonical,
                source="llm_web",
            )
        except Exception as exc:
            logger.warning("retailer enrich save failed for %r: %s", name, exc)
