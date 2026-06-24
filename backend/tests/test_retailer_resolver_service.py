import json
from pathlib import Path

import pytest

from services.retailer_resolver_service import RetailerResolverService

FIXTURE_CATALOG = Path(__file__).parent / "fixtures" / "mini_retailer_catalog.json"


@pytest.fixture
def fixture_entries() -> dict[str, dict]:
    payload = json.loads(FIXTURE_CATALOG.read_text(encoding="utf-8"))
    return payload["entries"]


@pytest.fixture
def resolver(monkeypatch: pytest.MonkeyPatch, fixture_entries: dict[str, dict]) -> RetailerResolverService:
    service = RetailerResolverService()
    monkeypatch.setattr(service, "_warm_cache", lambda: dict(fixture_entries))
    service.load()
    return service


def test_normalize_strips_legal_suffix():
    assert RetailerResolverService.normalize("Детский мир (ПАО)") == "детский мир"


def test_lookup_hit(resolver: RetailerResolverService):
    entry = resolver.lookup("Детский мир")
    assert entry is not None
    assert entry.unified_parent == "Для Детей"


def test_lookup_miss(resolver: RetailerResolverService):
    assert resolver.lookup("Неизвестный Магазин XYZ") is None


def test_save_entry_upserts_and_updates_cache(
    monkeypatch: pytest.MonkeyPatch,
    fixture_entries: dict[str, dict],
):
    service = RetailerResolverService()
    monkeypatch.setattr(service, "_warm_cache", lambda: dict(fixture_entries))
    upserts: dict[str, dict] = {}

    def _fake_upsert(key: str, entry: dict) -> None:
        upserts[key] = entry

    monkeypatch.setattr(service, "_upsert_entry", _fake_upsert)
    service.load()
    service.save_entry(
        key="леонардо",
        unified_parent="Досуг И Отдых",
        unified_subcategory="Хобби и творчество",
        canonical_name="Леонардо",
        source="llm_web",
    )
    assert "леонардо" in upserts
    entry = service.lookup("Леонардо")
    assert entry is not None
    assert entry.source == "llm_web"


def test_upsert_requires_pocketbase_url(
    monkeypatch: pytest.MonkeyPatch,
    fixture_entries: dict[str, dict],
):
    monkeypatch.delenv("POCKETBASE_URL", raising=False)
    service = RetailerResolverService()
    monkeypatch.setattr(service, "_warm_cache", lambda: dict(fixture_entries))
    service.load()

    with pytest.raises(RuntimeError, match="POCKETBASE_URL is not configured"):
        service.save_entry(
            key="леонардо",
            unified_parent="Досуг И Отдых",
            unified_subcategory="Хобби и творчество",
            canonical_name="Леонардо",
            source="llm_web",
        )
