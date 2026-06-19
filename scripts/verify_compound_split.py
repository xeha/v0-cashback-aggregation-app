#!/usr/bin/env python3
"""Verify CategoryCompoundSplitService JSON parsing (no LLM call)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.category_compound_split_service import (  # noqa: E402
    CategoryCompoundSplitService,
    _coerce_parts,
)


def main() -> int:
    failed = 0
    cases = [
        ("купаты и колбаски", ["купаты", "колбаски"], ["купаты", "колбаски"]),
        ("молоко, сливки", ["молоко", "сливки"], ["молоко", "сливки"]),
        ("пиво и сидр", ["пиво и сидр"], ["пиво и сидр"]),
        ("пиво и сидр", [], ["пиво и сидр"]),
        ("пиво и сидр", None, ["пиво и сидр"]),
    ]

    for raw, parts_value, expected in cases:
        got = _coerce_parts(raw, parts_value)
        ok = got == expected
        print(f"{'PASS' if ok else 'FAIL'}: coerce {raw!r} {parts_value!r} -> {got!r}")
        if not ok:
            print(f"       expected {expected!r}")
            failed += 1

    import os

    os.environ["COMPOUND_SPLIT_LLM_ENABLED"] = "false"
    service = CategoryCompoundSplitService()
    unchanged = service.expand_compound_items(
        [CategoryMapRequestItem(raw_category="купаты и колбаски", rate=5.0)]
    )
    if len(unchanged) != 1 or unchanged[0].raw_category != "купаты и колбаски":
        print("FAIL: disabled path should return input unchanged")
        failed += 1
    else:
        print("PASS: expand with COMPOUND_SPLIT_LLM_ENABLED=false returns input unchanged")

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
