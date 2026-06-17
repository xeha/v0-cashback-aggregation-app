#!/usr/bin/env python3
"""Generate backend/data/parent_category_enriched.json from category_hierarchy.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
HIERARCHY_PATH = REPO_ROOT / "backend" / "data" / "category_hierarchy.json"
DISAMBIG_PATH = REPO_ROOT / "backend" / "data" / "parent_category_disambiguation.json"
OUTPUT_PATH = REPO_ROOT / "backend" / "data" / "parent_category_enriched.json"


def normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def fallback_leaf_for_parent(parent_name: str, subcategories: list[dict]) -> str:
    for sub in subcategories:
        if sub["name"].lower().startswith("прочее"):
            return sub["name"]
    return subcategories[0]["name"] if subcategories else parent_name


def build_enriched(hierarchy: dict, disambig: dict) -> dict:
    result: dict[str, dict] = {}
    for parent in hierarchy.get("parents", []):
        name = parent["name"]
        children = [s["name"] for s in parent.get("subcategories", [])]
        base = f"{name}: {', '.join(children)}"
        entry = disambig.get(name, {})
        suffix = entry.get("suffix", "")
        embedding_text = f"{base}. {suffix}".strip() if suffix else base
        aliases = list(entry.get("extra_aliases", []))
        if normalize(name) not in {normalize(a) for a in aliases}:
            aliases.append(name)
        result[name] = {
            "aliases": sorted({normalize(a) for a in aliases}),
            "embedding_text": embedding_text,
            "fallback_leaf": fallback_leaf_for_parent(name, parent.get("subcategories", [])),
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    if not HIERARCHY_PATH.is_file():
        print(f"ERROR: missing {HIERARCHY_PATH}", file=sys.stderr)
        return 1
    hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
    disambig = {}
    if DISAMBIG_PATH.is_file():
        disambig = json.loads(DISAMBIG_PATH.read_text(encoding="utf-8"))
    out = build_enriched(hierarchy, disambig)
    OUTPUT_PATH.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH} ({len(out)} parents)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
