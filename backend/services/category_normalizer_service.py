from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from rapidfuzz import fuzz

ALIASES_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "market_category_aliases.json"
)
CONSENSUS_PATHS = (
    Path(__file__).resolve().parent.parent / "data" / "archive" / "market_cashback_consensus.json",
    Path(__file__).resolve().parent.parent / "data" / "market_cashback_consensus.json",
)
CATALOG_PATHS = (
    Path(__file__).resolve().parent.parent / "data" / "archive" / "market_category_catalog.json",
    Path(__file__).resolve().parent.parent / "data" / "market_category_catalog.json",
)

NormalizeSource = Literal["sanitize", "alias", "token_set", "fuzzy", "passthrough"]

_LEADING_RATE_RE = re.compile(
    r"^\s*(?:\d+(?:[.,]\d+)?\s*%?\s*|%\s*)",
    re.IGNORECASE,
)


def _normalize_key(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _token_set_key(name: str) -> str:
    tokens = [token for token in _normalize_key(name).split() if token != "и"]
    return " ".join(sorted(tokens))


def _sanitize_raw(raw: str) -> tuple[str, bool]:
    cleaned = raw.strip()
    cleaned = _LEADING_RATE_RE.sub("", cleaned).strip()
    cleaned = " ".join(cleaned.split())
    changed = _normalize_key(cleaned) != _normalize_key(raw)
    return cleaned, changed


def _load_json_from_first_existing(paths: tuple[Path, ...]) -> object | None:
    for path in paths:
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


@dataclass(frozen=True)
class NormalizeResult:
    original: str
    normalized: str
    source: NormalizeSource
    display_label: str


class CategoryNormalizerService:
    def __init__(self) -> None:
        self._aliases: dict[str, str] = {}
        self._token_set_index: dict[str, str] = {}
        self._whitelist: list[str] = []
        self._whitelist_set: set[str] = set()
        self._fuzzy_threshold = float(
            os.environ.get("CATEGORY_NORMALIZE_FUZZY_THRESHOLD", "0.88")
        )

    @property
    def is_loaded(self) -> bool:
        return bool(self._whitelist)

    def load(self) -> None:
        raw_aliases = json.loads(ALIASES_PATH.read_text(encoding="utf-8"))
        self._aliases = {
            _normalize_key(key): _normalize_key(value)
            for key, value in raw_aliases.items()
        }

        whitelist: set[str] = set()
        consensus_data = _load_json_from_first_existing(CONSENSUS_PATHS)
        if isinstance(consensus_data, list):
            whitelist.update(str(row.get("key", "")) for row in consensus_data if isinstance(row, dict))
        whitelist.update(self._aliases.keys())
        whitelist.update(self._aliases.values())

        catalog_data = _load_json_from_first_existing(CATALOG_PATHS)
        if isinstance(catalog_data, dict):
            for entries in catalog_data.values():
                if not isinstance(entries, dict):
                    continue
                for key, entry in entries.items():
                    if isinstance(entry, dict) and entry.get("_consensus"):
                        whitelist.add(key)

        self._whitelist = sorted(key for key in whitelist if key)
        self._whitelist_set = set(self._whitelist)
        self._token_set_index = {}
        for key in self._whitelist:
            signature = _token_set_key(key)
            self._token_set_index.setdefault(signature, key)

    def normalize(self, raw_category: str) -> NormalizeResult:
        original = raw_category
        sanitized, sanitize_changed = _sanitize_raw(raw_category)
        display_label = sanitized
        current = sanitized
        normalized_key = _normalize_key(current)

        alias_target = self._aliases.get(normalized_key)
        if alias_target:
            return NormalizeResult(
                original=original,
                normalized=alias_target,
                source="alias",
                display_label=display_label,
            )

        if normalized_key in self._whitelist_set:
            return NormalizeResult(
                original=original,
                normalized=normalized_key,
                source="sanitize" if sanitize_changed else "passthrough",
                display_label=display_label,
            )

        token_target = self._token_set_index.get(_token_set_key(current))
        if token_target and token_target != normalized_key:
            return NormalizeResult(
                original=original,
                normalized=token_target,
                source="token_set",
                display_label=display_label,
            )

        fuzzy_target, fuzzy_score = self._fuzzy_match(normalized_key)
        if fuzzy_target:
            return NormalizeResult(
                original=original,
                normalized=fuzzy_target,
                source="fuzzy",
                display_label=display_label,
            )

        if sanitize_changed:
            return NormalizeResult(
                original=original,
                normalized=normalized_key,
                source="sanitize",
                display_label=display_label,
            )

        return NormalizeResult(
            original=original,
            normalized=normalized_key,
            source="passthrough",
            display_label=display_label,
        )

    def _fuzzy_match(self, normalized_key: str) -> tuple[str | None, float]:
        best_key: str | None = None
        best_score = 0.0
        tied = False

        for candidate in self._whitelist:
            score = fuzz.ratio(normalized_key, candidate) / 100.0
            if score < self._fuzzy_threshold:
                continue
            if score > best_score:
                best_score = score
                best_key = candidate
                tied = False
            elif score == best_score and candidate != best_key:
                tied = True

        if best_key is None or tied:
            return None, best_score
        return best_key, best_score


_normalizer: CategoryNormalizerService | None = None


def get_category_normalizer() -> CategoryNormalizerService:
    global _normalizer
    if _normalizer is None:
        _normalizer = CategoryNormalizerService()
        _normalizer.load()
    return _normalizer
