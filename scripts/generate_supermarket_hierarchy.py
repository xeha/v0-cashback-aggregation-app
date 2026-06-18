#!/usr/bin/env python3
"""Generate supermarket_category_hierarchy.json and market_parent_enriched.json from tree."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE_DIR = ROOT / "backend" / "data" / "archive"
TREE_PATH = ARCHIVE_DIR / "supermarket_catalog_tree.json"
HIERARCHY_PATH = ARCHIVE_DIR / "supermarket_category_hierarchy.json"
ENRICHED_PATH = ARCHIVE_DIR / "market_parent_enriched.json"

FALLBACK_L1 = "Прочее"
FALLBACK_L2 = "Прочее"


def _normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def main() -> None:
    tree = json.loads(TREE_PATH.read_text(encoding="utf-8"))
    categories = tree["categories"]

    parents: list[dict] = []
    subcategory_names: list[str] = []
    subcategory_to_parent: dict[str, str] = {}

    for cat in categories:
        l1_name = cat["name"]
        subs = [s["name"] for s in cat.get("subcategories", [])]
        parents.append(
            {"id": cat["id"], "name": l1_name, "subcategories": cat.get("subcategories", [])}
        )
        for sub in subs:
            subcategory_names.append(sub)
            subcategory_to_parent[_normalize(sub)] = l1_name

    if not any(p["name"] == FALLBACK_L1 for p in parents):
        parents.append(
            {
                "id": 999,
                "name": FALLBACK_L1,
                "subcategories": [{"id": "999.1", "name": FALLBACK_L2}],
            }
        )
    if FALLBACK_L2 not in subcategory_names:
        subcategory_names.append(FALLBACK_L2)
        subcategory_to_parent[_normalize(FALLBACK_L2)] = FALLBACK_L1

    hierarchy = {
        "source": str(TREE_PATH.name),
        "total_parents": len(parents),
        "total_subcategories": len(subcategory_names),
        "parents": parents,
        "subcategory_names": subcategory_names,
        "subcategory_to_parent": subcategory_to_parent,
    }
    HIERARCHY_PATH.write_text(
        json.dumps(hierarchy, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    enriched: dict[str, dict] = {}
    for parent in parents:
        name = parent["name"]
        child_names = [s["name"] for s in parent.get("subcategories", [])]
        enriched[name] = {
            "aliases": [_normalize(name)],
            "embedding_text": f"{name}: {', '.join(child_names)}",
            "fallback_leaf": child_names[-1] if child_names else FALLBACK_L2,
        }

    ENRICHED_PATH.write_text(json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {HIERARCHY_PATH} ({len(parents)} parents, {len(subcategory_names)} subcategories)")
    print(f"Wrote {ENRICHED_PATH}")


if __name__ == "__main__":
    main()
