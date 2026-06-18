#!/usr/bin/env python3
"""Verify market category catalog mapping cases."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from sentence_transformers import SentenceTransformer  # noqa: E402
from services.market_mapper_service import MarketMapperService  # noqa: E402

# source_name, source_slug, raw, expected_sub, expected_conf, expected_parent, expected_macro, expected_source
CASES = [
    (
        "Магнит",
        "magnit",
        "Кисломолочка",
        "Кефир, ряженка, простокваша",
        1.0,
        "Молоко, сыр, яйца",
        False,
        "catalog",
    ),
    (
        "Лента",
        "lenta",
        "Молоко и сливки",
        "Молоко",
        1.0,
        "Молоко, сыр, яйца",
        False,
        "catalog",
    ),
    (
        "Пятёрочка",
        "pyaterochka",
        "Пиво и сидр",
        "Слабоалкогольные напитки и сидр",
        1.0,
        "Алкогольные напитки",
        False,
        "catalog",
    ),
    ("Магнит", "magnit", "Молоко", "Молоко", None, "Молоко, сыр, яйца", False, None),
]


def main() -> int:
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    mapper = MarketMapperService()
    mapper.load(model=model)
    failed = 0

    for case in CASES:
        (
            source_name,
            source_slug,
            raw,
            expected_sub,
            expected_conf,
            expected_parent,
            expected_macro,
            expected_source,
        ) = case
        result = mapper.map_items(
            [CategoryMapRequestItem(raw_category=raw, rate=10.0)],
            source_name,
            source_slug,
        )[0]
        conf_ok = expected_conf is None or result.confidence == expected_conf
        source_ok = expected_source is None or result.match_source == expected_source
        ok = (
            result.unified_category == expected_sub
            and result.unified_parent == expected_parent
            and result.is_macro_category == expected_macro
            and conf_ok
            and source_ok
        )
        status = "PASS" if ok else "FAIL"
        print(
            f"{status}: {source_name} + {raw!r} -> "
            f"{result.unified_category!r} ({result.match_source}, {result.confidence})"
        )
        if not ok:
            print(f"       expected {expected_sub!r} / {expected_parent!r}")
            failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
