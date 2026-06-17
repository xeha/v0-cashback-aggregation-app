#!/usr/bin/env python3
"""Verify bank category catalog mapping cases from design spec."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.mapper_service import MapperService  # noqa: E402

CASES = [
    ("Сбер", "Аптеки", "Аптеки", 1.0),
    ("Яндекс Банк", "Яндекс Лавка", "Покупки в приложении банка", 1.0),
    ("Альфа-Банк", "Активный отдых", "Развлечения", 1.0),
    ("ОТП Банк", "АЗС", "АЗС и топливо", 1.0),
    ("ОТП Банк", "Женская одежда", "Одежда и обувь", 1.0),
    ("Сбербанк", "Самокат", "Доставка продуктов", 1.0),
    ("ОТП Банк", "Прочее (медицина)", "Медицина", 1.0),
    ("Альфа-Банк", "Все покупки", "Все покупки", 1.0),
]


def main() -> int:
    mapper = MapperService()
    mapper.load()
    failed = 0
    for source_name, raw, expected_unified, expected_conf in CASES:
        items = [CategoryMapRequestItem(raw_category=raw, rate=5.0)]
        result = mapper.map_items(items, source_name)[0]
        ok = (
            result.unified_category == expected_unified
            and result.confidence == expected_conf
        )
        status = "PASS" if ok else "FAIL"
        print(f"{status}: {source_name!r} + {raw!r} -> {result.unified_category!r} ({result.confidence})")
        if not ok:
            print(f"       expected {expected_unified!r} @ {expected_conf}")
            failed += 1

    psb = mapper.map_items(
        [CategoryMapRequestItem(raw_category="Супермаркеты", rate=3.0)],
        "ПСБ",
    )[0]
    if psb.confidence == 1.0 and psb.unified_category == "Супермаркеты":
        print("PASS: ПСБ uses non-catalog path (override or embedding)")
    elif psb.unified_category in ("Супермаркеты", "Продукты питания") and psb.confidence < 1.0:
        print(f"PASS: ПСБ embedding/override path ({psb.unified_category}, {psb.confidence})")
    else:
        print(f"FAIL: ПСБ unexpected {psb.unified_category!r} @ {psb.confidence}")
        failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
