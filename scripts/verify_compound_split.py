#!/usr/bin/env python3
"""Verify compound product splitting (rule-based, no LLM)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.category_compound_split_service import (  # noqa: E402
    CategoryCompoundSplitService,
    _coerce_parts,
)
from services.category_text_utils import split_compound_products  # noqa: E402


def main() -> int:
    failed = 0
    rule_cases = [
        ("купаты и колбаски", ["купаты", "колбаски"]),
        ("молоко, сливки", ["молоко", "сливки"]),
        ("молоко и сливки", ["молоко", "сливки"]),
        ("пиво и сидр", ["пиво", "сидр"]),
        ("Пиво и сидр", ["Пиво", "сидр"]),
        ("колбаса и молоко", ["колбаса", "молоко"]),
        ("готовая кулинария", ["готовая кулинария"]),
        ("замороженные фрукты и ягоды", ["замороженные фрукты и ягоды"]),
        ("йогурты и десерты", ["йогурты и десерты"]),
        ("мясо и птица", ["мясо и птица"]),
        ("фрукты, овощи", ["фрукты, овощи"]),
    ]

    from services.category_text_utils import sanitize_raw

    sanitized_milk, _ = sanitize_raw("5% молоко и сливки")
    rule_cases.append((sanitized_milk, ["молоко", "сливки"]))

    for raw, expected in rule_cases:
        got = split_compound_products(raw)
        ok = got == expected
        print(f"{'PASS' if ok else 'FAIL'}: rule split {raw!r} -> {got!r}")
        if not ok:
            print(f"       expected {expected!r}")
            failed += 1

    coerce_cases = [
        ("купаты и колбаски", ["купаты", "колбаски"], ["купаты", "колбаски"]),
        ("пиво и сидр", ["пиво", "сидр"], ["пиво", "сидр"]),
        ("пиво и сидр", [], ["пиво и сидр"]),
    ]
    for raw, parts_value, expected in coerce_cases:
        got = _coerce_parts(raw, parts_value)
        ok = got == expected
        print(f"{'PASS' if ok else 'FAIL'}: coerce {raw!r} {parts_value!r} -> {got!r}")
        if not ok:
            failed += 1

    os.environ["COMPOUND_SPLIT_LLM_ENABLED"] = "false"
    service = CategoryCompoundSplitService()
    expanded = service.expand_compound_items(
        [
            CategoryMapRequestItem(raw_category="пиво и сидр", rate=15.0),
            CategoryMapRequestItem(raw_category="молоко, сливки", rate=10.0),
        ]
    )
    expected_expand = [
        ("пиво", 15.0),
        ("сидр", 15.0),
        ("молоко", 10.0),
        ("сливки", 10.0),
    ]
    got_expand = [(item.raw_category, item.rate) for item in expanded]
    if got_expand != expected_expand:
        print(f"FAIL: expand without LLM -> {got_expand!r}, expected {expected_expand!r}")
        failed += 1
    else:
        print("PASS: expand splits by rule without LLM")

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
