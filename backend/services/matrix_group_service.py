"""Port of groupMatrixRows and related grouping from lib/matrix.ts."""

from __future__ import annotations

from schemas import ComparisonPart, MatrixGroup, MatrixRow
from services.category_label import format_category_label, labels_equivalent, normalize_category_label
from services.market_comparison_service import (
    ComparisonAnchorRow,
    ComparisonItemRow,
    build_market_groups,
    parts_in_anchor_subtree,
    resolve_market_display_anchor,
    summary_rates_for_parts,
)
from services.reference_hierarchy_order import REFERENCE_HIERARCHY_DEPARTMENT_ORDER


def _consolidate_group_rows(rows: list[MatrixRow]) -> list[MatrixRow]:
    macro_by_parent: dict[str, MatrixRow] = {}
    leaves: list[MatrixRow] = []

    for row in rows:
        is_macro_row = row.is_macro or bool(
            row.parent and labels_equivalent(row.category, row.parent)
        )
        if is_macro_row and row.parent:
            key = normalize_category_label(row.parent)
            existing = macro_by_parent.get(key)
            if existing:
                existing.rates = {**existing.rates, **row.rates}
                existing.bank_raw = None
                existing.is_macro = True
            else:
                macro_by_parent[key] = row.model_copy(
                    update={
                        "category": format_category_label(row.parent),
                        "is_macro": True,
                        "bank_raw": None,
                        "rates": dict(row.rates),
                    }
                )
            continue
        leaves.append(row)

    return [*macro_by_parent.values(), *leaves]


def is_macro_only_group(group: MatrixGroup) -> bool:
    if group.is_macro_only is not None:
        return group.is_macro_only
    if not group.rows:
        return False
    return all(
        row.is_macro or bool(row.parent and labels_equivalent(row.category, row.parent))
        for row in group.rows
    )


def _visible_macro_children(parent: str, macro_rows: list[MatrixRow]) -> list[MatrixRow]:
    visible: list[MatrixRow] = []
    for row in macro_rows:
        ocr_label = (row.market_raw or "").strip()
        if ocr_label and not labels_equivalent(ocr_label, parent):
            visible.append(row)
            continue
        if not labels_equivalent(row.category, parent):
            visible.append(row)
    return visible


def _format_range(rate_range: dict[str, float]) -> float:
    return rate_range["max"]


def _build_market_groups_as_matrix(parts: list[ComparisonPart]) -> list[MatrixGroup]:
    order_index = {
        normalize_category_label(name): index
        for index, name in enumerate(REFERENCE_HIERARCHY_DEPARTMENT_ORDER)
    }
    by_department: dict[str, list[ComparisonPart]] = {}
    for part in parts:
        if not part.path:
            continue
        dept = part.path[0].name
        by_department.setdefault(dept, []).append(part)

    groups: list[MatrixGroup] = []
    for comparison_group in build_market_groups(parts):
        dept_parts = by_department.get(comparison_group.parent, [])
        display_depth, display_anchor_label = resolve_market_display_anchor(dept_parts)
        display_parent = (
            format_category_label(display_anchor_label) if display_depth > 0 else comparison_group.parent
        )
        summary_parts = (
            parts_in_anchor_subtree(dept_parts, display_depth)
            if display_depth > 0
            else dept_parts
        )
        summary_rates = summary_rates_for_parts(summary_parts)

        rows: list[MatrixRow] = []
        for row in comparison_group.rows:
            if isinstance(row, ComparisonAnchorRow):
                rates = {
                    store: _format_range({"min": rate_range.min, "max": rate_range.max})
                    for store, rate_range in row.rate_ranges.items()
                }
                rows.append(
                    MatrixRow(
                        category=format_category_label(row.label),
                        parent=comparison_group.parent,
                        row_kind="anchor",
                        reference_department=comparison_group.parent,
                        reference_node_id=row.node_id,
                        rate_ranges={
                            store: {"min": rate_range.min, "max": rate_range.max}
                            for store, rate_range in row.rate_ranges.items()
                        },
                        rates=rates,
                    )
                )
            elif isinstance(row, ComparisonItemRow):
                rows.append(
                    MatrixRow(
                        category=format_category_label(row.label),
                        parent=comparison_group.parent,
                        row_kind="item",
                        reference_department=comparison_group.parent,
                        reference_node_id=row.node_id,
                        rates={row.store: row.rate},
                    )
                )

        groups.append(
            MatrixGroup(
                parent=comparison_group.parent,
                display_parent=display_parent if display_parent != comparison_group.parent else None,
                summary_rates=summary_rates,
                rows=rows,
                is_macro_only=all(r.row_kind == "anchor" for r in rows),
            )
        )

    return sorted(
        groups,
        key=lambda group: (
            order_index.get(normalize_category_label(group.parent), 2**31 - 1),
            group.parent,
        ),
    )


def group_matrix_rows(
    rows: list[MatrixRow],
    market_parts: list[ComparisonPart] | None = None,
) -> list[MatrixGroup]:
    if market_parts:
        return _build_market_groups_as_matrix(market_parts)

    has_reference_hierarchy_rows = any(
        row.reference_department is not None or row.reference_depth is not None for row in rows
    )
    if has_reference_hierarchy_rows:
        by_department: dict[str, dict[str, object]] = {}
        for row in rows:
            parent_label = row.reference_department or row.parent or row.category
            parent_key = normalize_category_label(parent_label)
            entry = by_department.setdefault(
                parent_key,
                {"parent": parent_label, "macro_rows": [], "child_rows": []},
            )
            if not entry["parent"]:
                entry["parent"] = parent_label
            depth = row.reference_depth
            is_macro_row = depth == 1 or row.is_macro is True
            if is_macro_row:
                entry["macro_rows"].append(row)
            else:
                entry["child_rows"].append(row)

        order_index = {
            normalize_category_label(name): index
            for index, name in enumerate(REFERENCE_HIERARCHY_DEPARTMENT_ORDER)
        }

        groups: list[MatrixGroup] = []
        for entry in by_department.values():
            parent = str(entry["parent"])
            macro_rows: list[MatrixRow] = entry["macro_rows"]
            child_rows: list[MatrixRow] = entry["child_rows"]

            summary_rates: dict[str, float] = {}
            for row in [*macro_rows, *child_rows]:
                for key, rate in row.rates.items():
                    summary_rates[key] = max(summary_rates.get(key, 0), rate)

            sorted_children = sorted(
                child_rows,
                key=lambda row: (
                    row.reference_depth if row.reference_depth is not None else 99,
                    row.category,
                ),
            )
            macro_children = _visible_macro_children(parent, macro_rows)
            if sorted_children:
                display_rows = sorted(
                    [*sorted_children, *macro_children],
                    key=lambda row: (
                        row.reference_depth if row.reference_depth is not None else 99,
                        row.market_raw or row.category,
                    ),
                )
            else:
                display_rows = macro_rows

            groups.append(
                MatrixGroup(
                    parent=parent,
                    summary_rates=summary_rates,
                    rows=display_rows,
                    is_macro_only=not sorted_children and not macro_children,
                )
            )

        return sorted(
            groups,
            key=lambda group: (
                order_index.get(normalize_category_label(group.parent), 2**31 - 1),
                group.parent,
            ),
        )

    by_parent: dict[str, dict[str, object]] = {}
    for row in rows:
        parent_label = row.parent or row.category
        parent_key = normalize_category_label(parent_label)
        entry = by_parent.setdefault(parent_key, {"parent": row.parent or parent_label, "rows": []})
        if not entry["parent"] and row.parent:
            entry["parent"] = row.parent
        entry["rows"].append(row)

    result: list[MatrixGroup] = []
    for entry in by_parent.values():
        parent = str(entry["parent"])
        group_rows: list[MatrixRow] = entry["rows"]
        children = _consolidate_group_rows(group_rows)
        summary_rates: dict[str, float] = {}
        for child in children:
            for key, rate in child.rates.items():
                summary_rates[key] = max(summary_rates.get(key, 0), rate)
        group = MatrixGroup(parent=parent, summary_rates=summary_rates, rows=children)
        group.is_macro_only = is_macro_only_group(group)
        result.append(group)
    return result
