#!/usr/bin/env python3
"""Generate backend/data/category_hierarchy.json from CashPack categories.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT.parent / "parsing_cat_subcat_hierarchy" / "categories.json"
OUTPUT_PATH = REPO_ROOT / "backend" / "data" / "category_hierarchy.json"


def normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def build_hierarchy(source: dict) -> dict:
    parents = []
    subcategory_to_parent: dict[str, str] = {}
    subcategory_names: list[str] = []

    for cat in source.get("categories", []):
        parent_name = cat["name"]
        subs = [
            {"id": s["id"], "name": s["name"]}
            for s in cat.get("subcategories", [])
        ]
        parents.append({"id": cat["id"], "name": parent_name, "subcategories": subs})
        for sub in subs:
            subcategory_to_parent[normalize(sub["name"])] = parent_name
            subcategory_names.append(sub["name"])

    return {
        "source": source.get("source", "https://cashpack.ru/offers/"),
        "parsed_at": source.get("parsed_at"),
        "total_parents": len(parents),
        "total_subcategories": len(subcategory_names),
        "parents": parents,
        "subcategory_names": sorted(subcategory_names, key=str.lower),
        "subcategory_to_parent": dict(sorted(subcategory_to_parent.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", default=str(DEFAULT_SOURCE))
    args = parser.parse_args()
    source_path = Path(args.source)
    if not source_path.is_file():
        print(f"ERROR: not found: {source_path}", file=sys.stderr)
        return 1
    raw = json.loads(source_path.read_text(encoding="utf-8"))
    out = build_hierarchy(raw)
    OUTPUT_PATH.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH} ({out['total_subcategories']} subcategories)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
