from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

_LEADING_RATE_RE = re.compile(
    r"^\s*(?:\d+(?:[.,]\d+)?\s*%?\s*|%\s*)",
    re.IGNORECASE,
)


def normalize_key(name: str) -> str:
    return " ".join(name.lower().strip().split())


def sanitize_raw(raw: str) -> tuple[str, bool]:
    cleaned = raw.strip()
    cleaned = _LEADING_RATE_RE.sub("", cleaned).strip()
    cleaned = " ".join(cleaned.split())
    changed = normalize_key(cleaned) != normalize_key(raw)
    return cleaned, changed


@dataclass(frozen=True)
class SanitizedCategory:
    display: str
    normalized_key: str
    source: Literal["sanitize", "passthrough"]


def sanitize_category(raw: str) -> SanitizedCategory:
    sanitized, changed = sanitize_raw(raw)
    display = sanitized or raw.strip()
    return SanitizedCategory(
        display=display,
        normalized_key=normalize_key(display),
        source="sanitize" if changed else "passthrough",
    )
