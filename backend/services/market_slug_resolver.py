import json
from pathlib import Path

ALIASES_PATH = Path(__file__).resolve().parent.parent / "data" / "market_aliases.json"


def _normalize_market_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def load_market_aliases() -> dict[str, str]:
    with ALIASES_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)
    return {_normalize_market_name(key): slug for key, slug in raw.items()}


def resolve_market_slug(
    source_name: str | None,
    source_slug: str | None = None,
    aliases: dict[str, str] | None = None,
) -> str | None:
    if source_slug and source_slug.strip():
        return source_slug.strip().lower()
    if not source_name or not source_name.strip():
        return None
    mapping = aliases if aliases is not None else load_market_aliases()
    return mapping.get(_normalize_market_name(source_name))
