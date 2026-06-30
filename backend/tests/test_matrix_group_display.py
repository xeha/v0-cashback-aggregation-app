from schemas import MatrixRow
from services.category_label import format_category_label, labels_equivalent
from services.matrix_group_service import group_matrix_rows


def test_bank_group_shows_expandable_child_row():
    rows = [
        MatrixRow(
            category=format_category_label("Для Детей"),
            parent="Для Детей",
            is_macro=True,
            rates={"alfa": 7},
        ),
        MatrixRow(
            category=format_category_label("Детский мир"),
            parent="Для Детей",
            is_macro=False,
            rates={"alfa": 7},
        ),
    ]
    groups = group_matrix_rows(rows)
    group = next(g for g in groups if labels_equivalent(g.parent, "Для Детей"))
    child_categories = [row.category for row in group.rows if not row.is_macro]
    assert child_categories == [format_category_label("Детский мир")]
    assert group.summary_rates["alfa"] == 7


def test_bank_group_stays_flat_when_macro_matches_parent():
    rows = [
        MatrixRow(
            category=format_category_label("Для Детей"),
            parent="Для Детей",
            is_macro=True,
            rates={"alfa": 5},
        ),
    ]
    groups = group_matrix_rows(rows)
    group = next(g for g in groups if labels_equivalent(g.parent, "Для Детей"))
    assert len(group.rows) == 1


def test_market_group_display_header_uses_lca_for_homogeneous_alcohol():
    from schemas import ComparisonPart, ReferencePathNode

    def market_part(store: str, rate: float, label: str, path_names: list[str]) -> ComparisonPart:
        path = [ReferencePathNode(id=f"n{i}:{name}", name=name) for i, name in enumerate(path_names)]
        return ComparisonPart(
            store=store,
            rate=rate,
            label=label,
            node_id=path[-1].id,
            path=path,
        )

    parts = [
        market_part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        market_part("lenta", 8, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
    ]
    groups = group_matrix_rows([], parts)
    group = next(g for g in groups if g.parent == "Напитки")
    assert labels_equivalent(group.display_parent or "", "Алкогольные напитки")


def test_market_group_keeps_department_header_when_categories_diverge():
    from schemas import ComparisonPart, ReferencePathNode

    def market_part(store: str, rate: float, label: str, path_names: list[str]) -> ComparisonPart:
        path = [ReferencePathNode(id=f"n{i}:{name}", name=name) for i, name in enumerate(path_names)]
        return ComparisonPart(
            store=store,
            rate=rate,
            label=label,
            node_id=path[-1].id,
            path=path,
        )

    parts = [
        market_part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
        market_part("lenta", 7, "Сок", ["Напитки", "Соки, воды, напитки", "Сок"]),
    ]
    groups = group_matrix_rows([], parts)
    group = next(g for g in groups if g.parent == "Напитки")
    assert group.display_parent in (None, "Напитки")
