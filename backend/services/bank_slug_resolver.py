from services import catalog_store


def _normalize_bank_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def load_bank_aliases() -> dict[str, str]:
    raw = catalog_store.get("bank_aliases")
    return {_normalize_bank_name(key): slug for key, slug in raw.items()}


def resolve_bank_slug(
    source_name: str | None,
    aliases: dict[str, str] | None = None,
) -> str | None:
    if not source_name or not source_name.strip():
        return None
    mapping = aliases if aliases is not None else load_bank_aliases()
    return mapping.get(_normalize_bank_name(source_name))
