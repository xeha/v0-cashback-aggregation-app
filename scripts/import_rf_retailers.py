#!/usr/bin/env python3
"""Import rf_retailers.json into backend/data/retailer_catalog.json."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT.parent / "rf_retailers.json"
OUTPUT = REPO_ROOT / "backend" / "data" / "retailer_catalog.json"

SECTION_TO_PARENT: dict[str, str] = {
    "FMCG — Продукты питания и товары повседневного спроса": "Продукты И Напитки",
    "Fashion — Одежда": "Одежда И Обувь",
    "БиКТ — Бытовая техника, электроника, мобильные устройства": "Техника И Электроника",
    "Детские товары и одежда": "Для Детей",
    "Косметика, парфюмерия и дрогери": "Косметика И Парфюмерия",
    "DIY & Household — Стройматериалы, ремонт, товары для дома": "Дом И Интерьер",
    "Аптеки и здоровье": "Медицина И Здоровье",
    "Спорт и активный отдых": "Спорт И Активный Отдых",
    "Обувь": "Одежда И Обувь",
    "Зоотовары": "Питомцам",
    "Ювелирные украшения": "Подарки",
    "Универсальные маркетплейсы (онлайн)": "Супермаркеты И Маркетплейсы",
}

LEGAL_SUFFIX_RE = re.compile(
    r"\s*[\(\[]\s*(?:ооо|ао|пао|зао|ип|x5 group|магнит)[^)\]]*[\)\]]",
    re.IGNORECASE,
)


def normalize_retailer_name(name: str) -> str:
    cleaned = LEGAL_SUFFIX_RE.sub("", name)
    cleaned = cleaned.split("—")[0].split("-")[0].strip()
    return " ".join(cleaned.lower().split())


def canonical_name(name: str) -> str:
    cleaned = LEGAL_SUFFIX_RE.sub("", name)
    return cleaned.split("(")[0].strip()


def import_retailers(source_path: Path) -> dict:
    rows = json.loads(source_path.read_text(encoding="utf-8"))
    entries: dict[str, dict] = {}
    for row in rows:
        section = row["section"]
        parent = SECTION_TO_PARENT.get(section)
        if not parent:
            raise KeyError(f"Unknown section: {section!r}")
        retailer = row["retailer"]
        key = normalize_retailer_name(retailer)
        if not key:
            continue
        entries[key] = {
            "unified_parent": parent,
            "unified_subcategory": row.get("segment") or parent,
            "canonical_name": canonical_name(retailer),
            "source": "static",
            "rf_section": section,
        }
    return {"version": "1.0", "entries": entries}


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.is_file():
        print(f"Source not found: {source}", file=sys.stderr)
        return 1
    catalog = import_retailers(source)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(catalog['entries'])} entries to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
