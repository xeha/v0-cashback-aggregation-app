from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

_LEADING_RATE_RE = re.compile(
    r"^\s*(?:\d+(?:[.,]\d+)?\s*%?\s*|%\s*)",
    re.IGNORECASE,
)
_AND_SPLIT_RE = re.compile(r"\s+и\s+", re.IGNORECASE)


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


def split_compound_products(text: str) -> list[str]:
    """Split a cashback line into separate products by comma or « и »."""
    cleaned = text.strip()
    if not cleaned:
        return []

    segments: list[str] = []
    for comma_part in re.split(r",\s*", cleaned):
        comma_part = comma_part.strip()
        if not comma_part:
            continue
        if _AND_SPLIT_RE.search(comma_part):
            segments.extend(
                part.strip() for part in _AND_SPLIT_RE.split(comma_part) if part.strip()
            )
        else:
            segments.append(comma_part)

    if len(segments) >= 2:
        return segments
    return [cleaned]
