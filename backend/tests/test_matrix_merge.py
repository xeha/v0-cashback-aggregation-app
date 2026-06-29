import pytest

from schemas import MappedItem, MatrixProvider
from services.category_label import format_category_label, labels_equivalent
from services.matrix_merge_service import create_provider_from_submission, merge_mapped_items

ALFA = MatrixProvider(key="alfa", name="Альфа-Банк", slug=None)


def detmir_item() -> MappedItem:
    return MappedItem(
        raw_category="Детский мир",
        unified_category="Для Детей",
        unified_subcategory="Для Детей",
        unified_parent="Для Детей",
        rate=7,
        confidence=1,
        is_macro_category=True,
    )


def _group_rows_by_parent(rows):
    by_parent: dict[str, list] = {}
    for row in rows:
        parent = row.parent or row.category
        by_parent.setdefault(parent, []).append(row)
    return by_parent


def test_bank_retailer_under_macro_parent():
    matrix = merge_mapped_items(None, ALFA, [detmir_item()], "bank")
    categories = [row.category for row in matrix.rows]
    assert any(labels_equivalent(label, "Детский мир") for label in categories)
    macro_row = next(
        row for row in matrix.rows if labels_equivalent(row.parent or "", "Для Детей") and row.is_macro
    )
    assert macro_row.rates.get("alfa") == 7
    child_row = next(
        row for row in matrix.rows if labels_equivalent(row.category, "Детский мир")
    )
    assert child_row.rates.get("alfa") == 7


def test_stays_flat_when_macro_label_matches_ocr_text():
    item = MappedItem(
        raw_category="Для детей",
        unified_category="Для Детей",
        unified_subcategory="Для Детей",
        unified_parent="Для Детей",
        rate=5,
        confidence=1,
        is_macro_category=True,
    )
    matrix = merge_mapped_items(None, ALFA, [item], "bank")
    groups = _group_rows_by_parent(matrix.rows)
    group = next(g for p, g in groups.items() if labels_equivalent(p, "Для Детей"))
    assert len(group) == 1
    assert group[0].category == format_category_label("Для Детей")


def test_create_provider_reuses_matching_name():
    existing = MatrixProvider(key="alfa", name="Альфа-Банк", slug="alfa-bank")
    provider = create_provider_from_submission(
        provider_name="альфа-банк",
        provider_slug=None,
        existing_keys={"alfa"},
        existing_providers=[existing],
    )
    assert provider.key == "alfa"


def test_market_accumulates_market_parts():
    item = MappedItem(
        raw_category="Пиво",
        unified_category="Пиво",
        rate=10,
        confidence=1,
        reference_path=[
            {"id": "n0:Напитки", "name": "Напитки"},
            {"id": "n1:Пиво", "name": "Пиво"},
        ],
        reference_node_id="n1:Пиво",
    )
    magnit = MatrixProvider(key="magnit", name="Магнит", slug="magnit-univer")
    matrix = merge_mapped_items(None, magnit, [item], "market")
    assert matrix.market_parts is not None
    assert len(matrix.market_parts) == 1
    assert matrix.market_parts[0].store == "magnit"
    assert matrix.market_parts[0].rate == 10
