import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from schemas import CategoryMapRequestItem
from services.mapper_service import MapperService
from services.retailer_resolver_service import RetailerResolverService

FIXTURE_CATALOG = Path(__file__).parent / "fixtures" / "mini_retailer_catalog.json"


def _fake_embeddings(_model, texts: list[str]) -> np.ndarray:
    return np.ones((len(texts), 8), dtype=np.float32)


@pytest.fixture
def mapper_with_retailer_resolver() -> MapperService:
    mapper = MapperService()
    with patch("services.mapper_service.encode_texts", side_effect=_fake_embeddings):
        mapper.load(model=MagicMock())
    payload = json.loads(FIXTURE_CATALOG.read_text(encoding="utf-8"))
    resolver = RetailerResolverService()
    resolver._entries = payload["entries"]  # test-only preloaded cache
    resolver._loaded = True
    resolver.set_allowed_parents(mapper._parents)
    mapper.set_retailer_resolver(resolver)
    return mapper


def test_retailer_lookup_maps_to_parent(mapper_with_retailer_resolver: MapperService):
    items = mapper_with_retailer_resolver.map_items(
        [CategoryMapRequestItem(raw_category="Пятёрочка", rate=5.0)],
        source_name="Альфа-Банк",
    )
    assert len(items) == 1
    assert items[0].unified_parent == "Продукты И Напитки"
    assert items[0].match_source == "retailer_catalog"
    assert items[0].should_enrich_retailer is False


def test_unknown_retailer_sets_enrich_flag(mapper_with_retailer_resolver: MapperService):
    with patch.object(
        mapper_with_retailer_resolver,
        "_match_parent_embedding",
        return_value=(None, 0.2),
    ):
        items = mapper_with_retailer_resolver.map_items(
            [CategoryMapRequestItem(raw_category="Leonardo Hobby", rate=5.0)],
            source_name="Т-Банк",
        )
    assert items[0].should_enrich_retailer is True
