#!/usr/bin/env python3
"""Verify CategoryNormalizerService cases."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from services.category_normalizer_service import CategoryNormalizerService  # noqa: E402

# raw, expected_normalized, expected_source
CASES = [
    ("5% Макароны", "макароны", "sanitize"),
    ("Макроны", "макароны", "alias"),
    ("Купаты и Колбаски", "колбасы и купаты", "alias"),
    ("сидр и пиво", "пиво и сидр", "alias"),
    ("пиво и сидр", "пиво и сидр", "passthrough"),
    ("Молоко", "молоко", "passthrough"),
    ("  купаты и колбаски  ", "колбасы и купаты", "alias"),
]


def main() -> int:
    normalizer = CategoryNormalizerService()
    normalizer.load()
    failed = 0

    for raw, expected_normalized, expected_source in CASES:
        result = normalizer.normalize(raw)
        ok = result.normalized == expected_normalized and result.source == expected_source
        status = "PASS" if ok else "FAIL"
        print(
            f"{status}: {raw!r} -> {result.normalized!r} ({result.source})"
        )
        if not ok:
            print(
                f"       expected {expected_normalized!r} / {expected_source!r}"
            )
            failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
