from pathlib import Path

import pytest

from services.retailer_resolver_service import RetailerResolverService

FIXTURE_CATALOG = Path(__file__).parent / "fixtures" / "mini_retailer_catalog.json"


@pytest.fixture
def resolver(tmp_path: Path) -> RetailerResolverService:
    service = RetailerResolverService(catalog_path=FIXTURE_CATALOG)
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


def test_save_entry_appends_to_catalog(tmp_path: Path):
    catalog_path = tmp_path / "retailer_catalog.json"
    catalog_path.write_text('{"version":"1.0","entries":{}}', encoding="utf-8")
    service = RetailerResolverService(catalog_path=catalog_path)
    service.load()
    service.save_entry(
        key="леонардо",
        unified_parent="Досуг И Отдых",
        unified_subcategory="Хобби и творчество",
        canonical_name="Леонардо",
        source="llm_web",
    )
    service.load()
    entry = service.lookup("Леонардо")
    assert entry is not None
    assert entry.source == "llm_web"
