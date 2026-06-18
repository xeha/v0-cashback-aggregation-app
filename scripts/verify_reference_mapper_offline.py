#!/usr/bin/env python3
"""Verify ReferenceHierarchy loader and depth resolver offline."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from services.reference_hierarchy import (  # noqa: E402
    ReferenceHierarchy,
    resolve_display_node,
)

# (node_id, depth, expected_name, expected_department_id)
CASES = [
    ("d04.c02", 2, "Кисломолочные продукты", "d04"),
    ("d04.c02.s01", 3, "Йогурты", "d04"),
    ("d04.c02.s01", 2, "Кисломолочные продукты", "d04"),
    ("d08", 1, "Замороженные продукты", "d08"),
]


def main() -> int:
    hierarchy = ReferenceHierarchy()
    hierarchy.load()
    failed = 0

    for node_id, depth, expected_name, expected_department_id in CASES:
        resolved = resolve_display_node(hierarchy, node_id, depth)
        ok = (
            resolved.name == expected_name
            and resolved.department_id == expected_department_id
        )
        status = "PASS" if ok else "FAIL"
        print(
            f"{status}: {node_id} @ depth={depth} -> "
            f"{resolved.name!r} ({resolved.department_id})"
        )
        if not ok:
            print(
                f"       expected {expected_name!r} ({expected_department_id})"
            )
            failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1

    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
