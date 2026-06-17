#!/usr/bin/env python3
"""Verify bank category catalog mapping cases from design spec."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.mapper_service import MapperService  # noqa: E402

# source, raw, expected_sub, expected_conf, is_bank_offer, expected_parent
CASES = [
    ("Сбер", "Аптеки", "Аптеки", 1.0, False, "Медицина И Здоровье"),
    ("Яндекс Банк", "Яндекс Лавка", "Доставка продуктов", 1.0, True, "Продукты И Напитки"),
    ("Альфа-Банк", "Активный отдых", "Спорт И Активный Отдых", 1.0, False, "Спорт И Активный Отдых"),
    ("Альфа-Банк", "Одежда и обувь", "Одежда И Обувь", 1.0, False, "Одежда И Обувь"),
    ("Альфа-Банк", "Кафе и рестораны", "Кафе И Рестораны", 1.0, False, "Кафе И Рестораны"),
    ("ОТП Банк", "АЗС", "Топливо", 1.0, False, "Авто"),
    ("ОТП Банк", "Женская одежда", "Женская одежда", 1.0, False, "Одежда И Обувь"),
    ("Сбербанк", "Самокат", "Доставка продуктов", 1.0, True, "Продукты И Напитки"),
    ("Альфа-Банк", "Детский мир", "Детский мир", 1.0, False, "Для Детей"),
    ("Яндекс Банк", "Яндекс Плюс", "Подписки", 1.0, True, "Онлайн Сервисы И Игры"),
    ("Т-Банк", "СберЗдоровье", "Прочее (МЕДИЦИНА)", 1.0, True, "Медицина И Здоровье"),
    ("ОТП Банк", "Прочее (медицина)", "Прочее (МЕДИЦИНА)", 1.0, False, "Медицина И Здоровье"),
    ("Альфа-Банк", "Все покупки", "Прочее (УСЛУГИ)", 1.0, False, "Услуги"),
    ("Газпромбанк", "Авиа билеты", "Авиа билеты", 1.0, False, "Путешествия"),
    ("ОТП Банк", "Каршеринг, прокат", "Такси", 1.0, False, "Транспорт"),
    ("Газпромбанк", "Каршеринг, прокат", "Супермаркеты", 1.0, False, "Супермаркеты И Маркетплейсы"),
]


def main() -> int:
    mapper = MapperService()
    mapper.load()
    failed = 0
    for case in CASES:
        source_name, raw, expected_sub, expected_conf = case[:4]
        expected_bank_offer = case[4] if len(case) > 4 else False
        expected_parent = case[5] if len(case) > 5 else None
        items = [CategoryMapRequestItem(raw_category=raw, rate=5.0)]
        result = mapper.map_items(items, source_name)[0]
        ok = (
            result.unified_category == expected_sub
            and result.unified_subcategory == expected_sub
            and (expected_parent is None or result.unified_parent == expected_parent)
            and result.confidence == expected_conf
            and result.is_bank_offer == expected_bank_offer
            and (
                expected_parent is None
                or expected_sub != expected_parent
                or result.is_macro_category
            )
        )
        status = "PASS" if ok else "FAIL"
        offer_note = " [bank offer]" if result.is_bank_offer else ""
        print(
            f"{status}: {source_name!r} + {raw!r} -> "
            f"{result.unified_category!r} / {result.unified_parent!r} "
            f"({result.confidence}){offer_note}"
        )
        if not ok:
            print(
                f"       expected {expected_sub!r} / {expected_parent!r} @ {expected_conf}, "
                f"is_bank_offer={expected_bank_offer}, got parent={result.unified_parent!r}"
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
