#!/usr/bin/env python3
"""Apply cross-market cashback consensus rows to market_category_catalog.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONSENSUS_PATH = ROOT / "backend" / "data" / "market_cashback_consensus.json"
CATALOG_PATH = ROOT / "backend" / "data" / "market_category_catalog.json"


def main() -> None:
    consensus: list[dict] = json.loads(CONSENSUS_PATH.read_text(encoding="utf-8"))
    catalog: dict[str, dict[str, dict]] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

    applied = 0
    for market_slug in catalog:
        for row in consensus:
            key = row["key"]
            catalog[market_slug][key] = {
                "market_category": row["market_category"],
                "unified_subcategory": row["unified_subcategory"],
                "unified_parent": row["unified_parent"],
                "is_macro": row["is_macro"],
                "_consensus": True,
            }
            applied += 1

    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    markets = len(catalog)
    print(
        f"Applied {len(consensus)} consensus rows × {markets} markets = {applied} catalog entries"
    )
    print(f"Updated {CATALOG_PATH}")


if __name__ == "__main__":
    main()
