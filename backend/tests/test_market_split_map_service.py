from pathlib import Path

from schemas import CategoryMapRequestItem
from services.market_split_map_service import MarketSplitMapService

FIXTURE_JSON = Path(__file__).parent / "fixtures" / "mini_hierarchy.json"


def _service(monkeypatch, llm_items):
    monkeypatch.setenv("MARKET_SPLIT_MAP_LLM_ENABLED", "true")
    service = MarketSplitMapService()
    service.load(path=FIXTURE_JSON)

    def fake_classify(batch, source_name):
        return llm_items

    monkeypatch.setattr(service, "_classify_batch", fake_classify)
    return service


def test_splits_compound_into_multiple_parts(monkeypatch):
    beer_id = _node_id("Светлое пиво")
    cider_id = _node_id("Слабоалкогольные напитки")
    service = _service(
        monkeypatch,
        {"Пиво и сидр": [
            {"split_text": "Пиво", "node_id": beer_id, "confidence": 0.95},
            {"split_text": "Сидр", "node_id": cider_id, "confidence": 0.9},
        ]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Пиво и сидр", rate=10.0)],
        source_name="Магнит",
        normalized_by_item=["пиво и сидр"],
    )
    assert len(items) == 2
    labels = {i.split_text for i in items}
    assert labels == {"Пиво", "Сидр"}
    assert all(i.raw_category == "Пиво и сидр" for i in items)


def test_single_node_not_split(monkeypatch):
    voda_id = _node_id("Вода")
    service = _service(
        monkeypatch,
        {"Вода": [{"split_text": "Вода", "node_id": voda_id, "confidence": 0.9}]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Вода", rate=5.0)],
        source_name="Лента",
        normalized_by_item=["вода"],
    )
    assert len(items) == 1
    assert items[0].reference_path[0].name == "Напитки"


def test_invalid_node_id_falls_back(monkeypatch):
    service = _service(
        monkeypatch,
        {"Хрень": [{"split_text": "Хрень", "node_id": "zzz", "confidence": 0.99}]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Хрень", rate=1.0)],
        source_name="X",
        normalized_by_item=["хрень"],
    )
    assert len(items) == 1
    assert items[0].match_source == "reference_fallback"
    assert items[0].reference_department == "Прочее"


def test_low_confidence_falls_back(monkeypatch):
    voda_id = _node_id("Вода")
    service = _service(
        monkeypatch,
        {"Вода": [{"split_text": "Вода", "node_id": voda_id, "confidence": 0.1}]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Вода", rate=5.0)],
        source_name="X",
        normalized_by_item=["вода"],
    )
    assert items[0].match_source == "reference_fallback"


def test_cache_hit_second_call(monkeypatch):
    voda_id = _node_id("Вода")
    service = _service(
        monkeypatch,
        {"Вода": [{"split_text": "Вода", "node_id": voda_id, "confidence": 0.9}]},
    )
    args = (
        [CategoryMapRequestItem(raw_category="Вода", rate=5.0)],
        "X",
        ["вода"],
    )
    service.map_items(*args)
    second = service.map_items(*args)
    assert second[0].match_source == "reference_cache"


_HELPER = MarketSplitMapService()
_HELPER.load(path=FIXTURE_JSON)


def _node_id(name: str) -> str:
    node = _HELPER._hierarchy.find_by_name(name)
    assert node is not None, name
    return node.id
