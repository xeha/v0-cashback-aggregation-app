from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

_LOCAL_RETAILER_CATALOG = (
    Path(__file__).resolve().parent.parent / "data" / "retailer_catalog.json"
)

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
    def __init__(self) -> None:
        self._entries: dict[str, dict] = {}
        self._allowed_parents: list[str] = []
        self._loaded = False
        self._client = None
        self._admin_token: str | None = None

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
        self._entries = self._warm_cache()
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
        key = self.normalize(key)
        entry = {
            "unified_parent": unified_parent,
            "unified_subcategory": unified_subcategory,
            "canonical_name": canonical_name,
            "source": source,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        self._upsert_entry(key, entry)
        self._entries[key] = entry
        self._loaded = True

    @staticmethod
    def _clean_base_url(url: str) -> str:
        return url.rstrip("/")

    def _pocketbase_url(self) -> str | None:
        raw = os.environ.get("POCKETBASE_URL", "").strip()
        return self._clean_base_url(raw) if raw else None

    def _require_pocketbase_url(self) -> str:
        base_url = self._pocketbase_url()
        if base_url is None:
            raise RuntimeError(
                "POCKETBASE_URL is not configured. "
                "Set POCKETBASE_URL (and admin credentials) to persist retailer catalog entries."
            )
        return base_url

    def _admin_credentials(self) -> tuple[str, str]:
        email = os.environ.get("POCKETBASE_ADMIN_EMAIL", "").strip()
        password = os.environ.get("POCKETBASE_ADMIN_PASSWORD", "").strip()
        if not email or not password:
            raise RuntimeError(
                "POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD is not configured"
            )
        return email, password

    def _admin_headers(self, client: httpx.Client) -> dict[str, str]:
        if self._admin_token:
            return {"Authorization": f"Bearer {self._admin_token}"}

        email, password = self._admin_credentials()
        base_url = self._require_pocketbase_url()
        response = client.post(
            f"{base_url}/api/collections/_superusers/auth-with-password",
            json={"identity": email, "password": password},
        )
        response.raise_for_status()
        token = response.json().get("token")
        if not token:
            raise RuntimeError("PocketBase admin auth succeeded without token")
        self._admin_token = str(token)
        return {"Authorization": f"Bearer {self._admin_token}"}

    def _request_with_admin_auth(
        self,
        client: httpx.Client,
        *,
        method: str,
        url: str,
        json_payload: dict | None = None,
    ) -> httpx.Response:
        headers = self._admin_headers(client)
        response = client.request(method, url, json=json_payload, headers=headers)
        if response.status_code != 401:
            response.raise_for_status()
            return response

        self._admin_token = None
        headers = self._admin_headers(client)
        retry = client.request(method, url, json=json_payload, headers=headers)
        retry.raise_for_status()
        return retry

    @staticmethod
    def _entry_from_record(record: dict) -> tuple[str, dict]:
        key = RetailerResolverService.normalize(str(record.get("key", "")).strip())
        if not key:
            raise ValueError("retailer_catalog record missing key")
        parent = str(record.get("unified_parent", "")).strip()
        if not parent:
            raise ValueError(f"retailer_catalog record {key!r} missing unified_parent")
        subcategory = str(record.get("unified_subcategory", "")).strip() or parent
        canonical = str(record.get("canonical_name", "")).strip() or key
        source = str(record.get("source", "")).strip() or "static"
        entry = {
            "unified_parent": parent,
            "unified_subcategory": subcategory,
            "canonical_name": canonical,
            "source": source,
        }
        added_at = record.get("added_at")
        if added_at:
            entry["added_at"] = added_at
        return key, entry

    def _load_local_catalog(self) -> dict[str, dict]:
        if not _LOCAL_RETAILER_CATALOG.is_file():
            raise RuntimeError(
                f"Local retailer catalog not found: {_LOCAL_RETAILER_CATALOG}. "
                "Set POCKETBASE_URL or restore backend/data/retailer_catalog.json."
            )
        payload = json.loads(_LOCAL_RETAILER_CATALOG.read_text(encoding="utf-8"))
        entries = payload.get("entries", {})
        if not isinstance(entries, dict):
            raise RuntimeError("Invalid local retailer_catalog.json: entries must be an object")
        logger.info("Loaded %d retailer entries from %s", len(entries), _LOCAL_RETAILER_CATALOG)
        return dict(entries)

    def _warm_cache(self) -> dict[str, dict]:
        base_url = self._pocketbase_url()
        if base_url is None:
            return self._load_local_catalog()
        entries: dict[str, dict] = {}
        page = 1
        per_page = 200
        with httpx.Client(timeout=15.0) as client:
            while True:
                response = client.get(
                    f"{base_url}/api/collections/retailer_catalog/records",
                    params={
                        "page": page,
                        "perPage": per_page,
                        "sort": "key",
                        "fields": "id,key,unified_parent,unified_subcategory,canonical_name,source,added_at",
                    },
                )
                if response.status_code in {401, 403}:
                    headers = self._admin_headers(client)
                    response = client.get(
                        f"{base_url}/api/collections/retailer_catalog/records",
                        params={
                            "page": page,
                            "perPage": per_page,
                            "sort": "key",
                            "fields": "id,key,unified_parent,unified_subcategory,canonical_name,source,added_at",
                        },
                        headers=headers,
                    )
                response.raise_for_status()
                payload = response.json()
                items = payload.get("items", [])
                if not isinstance(items, list):
                    raise RuntimeError("PocketBase retailer_catalog payload has invalid items")
                for item in items:
                    key, entry = self._entry_from_record(item)
                    entries[key] = entry

                total_items = int(payload.get("totalItems", len(items)))
                if page * per_page >= total_items:
                    break
                page += 1
        return entries

    def _find_record_id_by_key(self, client: httpx.Client, key: str) -> str | None:
        base_url = self._require_pocketbase_url()
        escaped_key = key.replace("\\", "\\\\").replace("'", "\\'")
        headers = self._admin_headers(client)
        response = client.get(
            f"{base_url}/api/collections/retailer_catalog/records",
            params={"filter": f"(key='{escaped_key}')", "perPage": 1, "fields": "id,key"},
            headers=headers,
        )
        if response.status_code == 401:
            self._admin_token = None
            headers = self._admin_headers(client)
            response = client.get(
                f"{base_url}/api/collections/retailer_catalog/records",
                params={"filter": f"(key='{escaped_key}')", "perPage": 1, "fields": "id,key"},
                headers=headers,
            )
        response.raise_for_status()
        items = response.json().get("items") or []
        if not items:
            return None
        return str(items[0].get("id"))

    def _upsert_entry(self, key: str, entry: dict) -> None:
        payload: dict[str, str] = {
            "key": key,
            "unified_parent": entry["unified_parent"],
            "unified_subcategory": entry["unified_subcategory"],
            "canonical_name": entry["canonical_name"],
            "source": entry["source"],
        }
        added_at = entry.get("added_at")
        if added_at:
            payload["added_at"] = added_at
        base_url = self._require_pocketbase_url()
        with httpx.Client(timeout=15.0) as client:
            record_id = self._find_record_id_by_key(client, key)
            if record_id:
                self._request_with_admin_auth(
                    client,
                    method="PATCH",
                    url=f"{base_url}/api/collections/retailer_catalog/records/{record_id}",
                    json_payload=payload,
                )
                return

            self._request_with_admin_auth(
                client,
                method="POST",
                url=f"{base_url}/api/collections/retailer_catalog/records",
                json_payload=payload,
            )

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
