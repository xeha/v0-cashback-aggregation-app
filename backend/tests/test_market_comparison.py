from schemas import ReferencePathNode
from services.market_comparison_service import (
    build_market_groups,
    resolve_market_display_anchor,
)
from services.reference_hierarchy_order import REFERENCE_HIERARCHY_DEPARTMENT_ORDER


def _part(store: str, rate: float, label: str, path_names: list[str]):
    from schemas import ComparisonPart

    path = [ReferencePathNode(id=f"n{i}:{name}", name=name) for i, name in enumerate(path_names)]
    return ComparisonPart(
        store=store,
        rate=rate,
        label=label,
        node_id=path[-1].id,
        path=path,
    )


def test_build_market_groups_anchors_at_category_when_stores_share_it():
    parts = [
        _part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("magnit", 10, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
        _part("lenta", 8, "Шампанское", ["Напитки", "Алкогольные напитки", "Шампанское"]),
    ]
    groups = build_market_groups(parts)
    napitki = next(group for group in groups if group.parent == "Напитки")
    anchor = next(row for row in napitki.rows if row.kind == "anchor")
    assert anchor.label == "Алкогольные напитки"


def test_build_market_groups_anchors_at_department_when_stores_diverge():
    parts = [
        _part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("lenta", 7, "Лимонад", ["Напитки", "Сладкие газированные напитки", "Лимонад"]),
    ]
    groups = build_market_groups(parts)
    anchor = next(row for row in groups[0].rows if row.kind == "anchor")
    assert anchor.label == "Напитки"


def test_build_market_groups_keeps_item_rows_for_every_part():
    parts = [
        _part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("lenta", 7, "Лимонад", ["Напитки", "Сладкие газированные напитки", "Лимонад"]),
    ]
    groups = build_market_groups(parts)
    items = sorted(row.label for row in groups[0].rows if row.kind == "item")
    assert items == ["Лимонад", "Пиво"]


def test_build_market_groups_anchor_rate_shows_min_max_range_per_store():
    parts = [
        _part("magnit", 5, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("magnit", 10, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
        _part("lenta", 8, "Вино", ["Напитки", "Алкогольные напитки", "Вино"]),
    ]
    groups = build_market_groups(parts)
    anchor = next(row for row in groups[0].rows if row.kind == "anchor")
    assert anchor.rate_ranges["magnit"].min == 5
    assert anchor.rate_ranges["magnit"].max == 10
    assert anchor.rate_ranges["lenta"].min == 8
    assert anchor.rate_ranges["lenta"].max == 8


def test_build_market_groups_does_not_compare_across_departments():
    parts = [
        _part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("lenta", 7, "Хлеб", ["Хлеб и выпечка", "Хлеб", "Батон"]),
    ]
    groups = build_market_groups(parts)
    assert sorted(group.parent for group in groups) == ["Напитки", "Хлеб и выпечка"]


def test_build_market_groups_no_anchor_when_only_one_store_in_department():
    parts = [
        _part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("magnit", 5, "Вода", ["Напитки", "Вода", "Минеральная вода"]),
    ]
    groups = build_market_groups(parts)
    anchors = [row for row in groups[0].rows if row.kind == "anchor"]
    assert len(anchors) == 0


def test_resolve_market_display_anchor_uses_l2_category_when_shared():
    parts = [
        _part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("lenta", 8, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
    ]
    depth, label = resolve_market_display_anchor(parts)
    assert depth == 1
    assert label == "Алкогольные напитки"


def test_resolve_market_display_anchor_keeps_department_when_stores_diverge():
    parts = [
        _part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        _part("lenta", 7, "Лимонад", ["Напитки", "Сладкие газированные напитки", "Лимонад"]),
    ]
    depth, label = resolve_market_display_anchor(parts)
    assert depth == 0
    assert label == "Напитки"


def test_reference_hierarchy_order_matches_frontend():
    assert len(REFERENCE_HIERARCHY_DEPARTMENT_ORDER) == 12
