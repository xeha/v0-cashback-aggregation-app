#!/usr/bin/env python3
"""Verify bank category catalog mapping cases from design spec."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.mapper_service import MapperService  # noqa: E402

# source, raw, expected_sub, expected_conf, is_bank_offer, expected_parent, expected_macro, expected_source
CASES = [
    ("Сбер", "Аптеки", "Аптеки", 1.0, False, "Медицина И Здоровье", False, "catalog"),
    ("Яндекс Банк", "Яндекс Лавка", "Доставка продуктов", 1.0, True, "Продукты И Напитки", False, "catalog"),
    ("Альфа-Банк", "Активный отдых", "Досуг И Отдых", 1.0, False, "Досуг И Отдых", True, "parent"),
    ("Альфа-Банк", "Кинотеатры, театры, выставки", "Кинотеатры, театры, выставки", 1.0, False, "Досуг И Отдых", False, None),
    ("Газпромбанк", "Кафе и рестораны", "Кафе И Рестораны", 1.0, False, "Кафе И Рестораны", True, "catalog"),
    ("Газпромбанк", "АЗС", "Топливо", 1.0, False, "Авто", False, "catalog"),
    ("ОТП Банк", "АЗС", "Топливо", 1.0, False, "Авто", False, None),
    ("Сбербанк", "Самокат", "Доставка продуктов", 1.0, True, "Продукты И Напитки", False, "catalog"),
    ("Альфа-Банк", "Все покупки", "Все покупки", 1.0, False, "Все покупки", True, "catalog"),
    ("Газпромбанк", "Авиа билеты", "Авиа билеты", 1.0, False, "Путешествия", False, "catalog"),
]


def main() -> int:
    mapper = MapperService()
    mapper.load()
    failed = 0
    for case in CASES:
        (
            source_name,
            raw,
            expected_sub,
            expected_conf,
            expected_bank_offer,
            expected_parent,
            expected_macro,
            expected_source,
        ) = case
        items = [CategoryMapRequestItem(raw_category=raw, rate=5.0)]
        result = mapper.map_items(items, source_name)[0]
        ok = (
            result.unified_category == expected_sub
            and result.unified_subcategory == expected_sub
            and result.unified_parent == expected_parent
            and result.confidence == expected_conf
            and result.is_bank_offer == expected_bank_offer
            and result.is_macro_category == expected_macro
            and (expected_source is None or result.match_source == expected_source)
        )
        status = "PASS" if ok else "FAIL"
        offer_note = " [bank offer]" if result.is_bank_offer else ""
        macro_note = " [macro]" if result.is_macro_category else ""
        print(
            f"{status}: {source_name!r} + {raw!r} -> "
            f"{result.unified_category!r} / {result.unified_parent!r} "
            f"({result.confidence}, {result.match_source}){offer_note}{macro_note}"
        )
        if not ok:
            print(
                f"       expected {expected_sub!r} / {expected_parent!r} @ {expected_conf}, "
                f"macro={expected_macro}, source={expected_source!r}, "
                f"got macro={result.is_macro_category}, source={result.match_source!r}"
            )
            failed += 1

    psb = mapper.map_items(
        [CategoryMapRequestItem(raw_category="Супермаркеты", rate=3.0)],
        "ПСБ",
    )[0]
    if psb.unified_category == "Супермаркеты" and psb.unified_parent == "Супермаркеты И Маркетплейсы":
        print(f"PASS: ПСБ embedding path ({psb.unified_category}, {psb.confidence})")
    elif psb.confidence < 1.0:
        print(f"PASS: ПСБ non-catalog path ({psb.unified_category}, {psb.confidence})")
    else:
        print(f"FAIL: ПСБ unexpected {psb.unified_category!r} / {psb.unified_parent!r} @ {psb.confidence}")
        failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
