#!/usr/bin/env python3
"""Auto-map parsed chain L2 names to unified taxonomy via embeddings."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from sentence_transformers import SentenceTransformer  # noqa: E402
from services.category_embedding import best_match, encode_texts  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PARSED_PATH = ROOT / "backend" / "data" / "parsed_market_taxonomies.json"
HIERARCHY_PATH = ROOT / "backend" / "data" / "supermarket_category_hierarchy.json"
CATALOG_PATH = ROOT / "backend" / "data" / "market_category_catalog.json"
REVIEW_THRESHOLD = 0.70


def _normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def main() -> None:
    parsed = json.loads(PARSED_PATH.read_text(encoding="utf-8"))
    hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

    subcategories: list[str] = hierarchy["subcategory_names"]
    sub_to_parent: dict[str, str] = hierarchy["subcategory_to_parent"]

    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    sub_embeddings = encode_texts(model, subcategories)

    needs_review: list[str] = []

    for market_slug, entries in parsed.items():
        catalog.setdefault(market_slug, {})
        for entry in entries:
            l2 = entry["l2"].strip()
            key = _normalize(l2)
            if key in catalog[market_slug]:
                continue
            query_emb = encode_texts(model, [l2])[0]
            idx, score = best_match(query_emb, sub_embeddings)
            unified_l2 = subcategories[idx]
            unified_l1 = sub_to_parent[_normalize(unified_l2)]
            catalog[market_slug][key] = {
                "market_category": l2,
                "unified_subcategory": unified_l2,
                "unified_parent": unified_l1,
                "is_macro": False,
                "_auto_map_score": round(float(score), 4),
            }
            if score < REVIEW_THRESHOLD:
                needs_review.append(f"{market_slug}: {l2!r} -> {unified_l2!r} ({score:.3f})")

    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {CATALOG_PATH}")
    if needs_review:
        print(f"\n{len(needs_review)} entries need manual review:")
        for line in needs_review:
            print(f"  {line}")
    else:
        print("All auto-mapped entries above review threshold")


if __name__ == "__main__":
    main()
