"""Port of lib/market-comparison.ts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from schemas import ComparisonPart

MARKET_DISPLAY_ANCHOR_MAX_DEPTH = 1


@dataclass
class RateRange:
    min: float
    max: float


@dataclass
class ComparisonAnchorRow:
    kind: Literal["anchor"]
    node_id: str
    label: str
    rate_ranges: dict[str, RateRange]


@dataclass
class ComparisonItemRow:
    kind: Literal["item"]
    node_id: str
    label: str
    store: str
    rate: float


ComparisonRow = ComparisonAnchorRow | ComparisonItemRow


@dataclass
class ComparisonGroup:
    parent: str
    rows: list[ComparisonRow]


def _stores_under(parts: list[ComparisonPart]) -> set[str]:
    return {part.store for part in parts}


def find_anchor_depth(parts: list[ComparisonPart]) -> int:
    total_stores = _stores_under(parts)
    depth = 0
    while True:
        by_child: dict[str, list[ComparisonPart]] = {}
        for part in parts:
            child = part.path[depth + 1] if len(part.path) > depth + 1 else None
            if child is None:
                return depth
            by_child.setdefault(child.id, []).append(part)
        descended = False
        for child_parts in by_child.values():
            if _stores_under(child_parts) == total_stores and len(by_child) == 1:
                depth += 1
                descended = True
                break
        if not descended:
            return depth


def parts_in_anchor_subtree(parts: list[ComparisonPart], depth: int) -> list[ComparisonPart]:
    if depth <= 0 or not parts:
        return parts
    anchor_id = parts[0].path[depth].id if len(parts[0].path) > depth else None
    if not anchor_id:
        return parts
    return [part for part in parts if len(part.path) > depth and part.path[depth].id == anchor_id]


def summary_rates_for_parts(parts: list[ComparisonPart]) -> dict[str, float]:
    summary: dict[str, float] = {}
    for part in parts:
        summary[part.store] = max(summary.get(part.store, 0), part.rate)
    return summary


def resolve_market_display_anchor(parts: list[ComparisonPart]) -> tuple[int, str]:
    if not parts or not parts[0].path:
        return 0, ""
    raw_depth = find_anchor_depth(parts)
    depth = min(raw_depth, MARKET_DISPLAY_ANCHOR_MAX_DEPTH)
    label = parts[0].path[depth].name if len(parts[0].path) > depth else parts[0].path[0].name
    return depth, label


def _range_for(parts: list[ComparisonPart]) -> dict[str, RateRange]:
    ranges: dict[str, RateRange] = {}
    for part in parts:
        current = ranges.get(part.store)
        if current is None:
            ranges[part.store] = RateRange(min=part.rate, max=part.rate)
        else:
            current.min = min(current.min, part.rate)
            current.max = max(current.max, part.rate)
    return ranges


def build_market_groups(parts: list[ComparisonPart]) -> list[ComparisonGroup]:
    by_department: dict[str, list[ComparisonPart]] = {}
    for part in parts:
        if not part.path:
            continue
        dept = part.path[0].name
        by_department.setdefault(dept, []).append(part)

    groups: list[ComparisonGroup] = []
    for parent, dept_parts in by_department.items():
        rows: list[ComparisonRow] = []
        store_count = len(_stores_under(dept_parts))

        if store_count >= 2:
            depth = find_anchor_depth(dept_parts)
            anchor_node = dept_parts[0].path[depth]
            rows.append(
                ComparisonAnchorRow(
                    kind="anchor",
                    node_id=anchor_node.id,
                    label=anchor_node.name,
                    rate_ranges=_range_for(dept_parts),
                )
            )

        for part in dept_parts:
            rows.append(
                ComparisonItemRow(
                    kind="item",
                    node_id=part.node_id,
                    label=part.label,
                    store=part.store,
                    rate=part.rate,
                )
            )
        groups.append(ComparisonGroup(parent=parent, rows=rows))

    return sorted(groups, key=lambda group: group.parent)
