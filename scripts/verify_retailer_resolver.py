#!/usr/bin/env python3
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

from services.retailer_resolver_service import RetailerResolverService

CASES = [
    ("Детский мир", "Для Детей"),
    ("Пятёрочка", "Продукты И Напитки"),
    ("Золотое Яблоко", "Косметика И Парфюмерия"),
]


def main() -> int:
    resolver = RetailerResolverService()
    resolver.load()
    failed = 0
    for raw, expected_parent in CASES:
        entry = resolver.lookup(raw)
        ok = entry is not None and entry.unified_parent == expected_parent
        status = "OK" if ok else "FAIL"
        actual = entry.unified_parent if entry else None
        print(f"{status}  {raw!r} -> {actual} (expected {expected_parent})")
        failed += 0 if ok else 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
