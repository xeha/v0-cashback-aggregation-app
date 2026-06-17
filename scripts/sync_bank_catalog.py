#!/usr/bin/env python3
"""Generate backend/data/bank_category_catalog.json from cashback_offers.json."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = (
    REPO_ROOT.parent / "sync_category_subcategory" / "cashback_offers.json"
)
HIERARCHY_PATH = REPO_ROOT / "backend" / "data" / "category_hierarchy.json"
ENRICHED_PATH = REPO_ROOT / "backend" / "data" / "parent_category_enriched.json"
MIGRATION_PATH = REPO_ROOT / "backend" / "data" / "taxonomy_migration.json"
OVERRIDES_PATH = REPO_ROOT / "backend" / "data" / "bank_category_unified_overrides.json"
ALIASES_PATH = REPO_ROOT / "backend" / "data" / "bank_aliases.json"
PARENT_SYNONYMS_PATH = REPO_ROOT / "backend" / "data" / "parent_category_synonyms.json"
CATALOG_PATH = REPO_ROOT / "backend" / "data" / "bank_category_catalog.json"
CATALOG_NAMES_PATH = REPO_ROOT / "lib" / "data" / "bank-catalog.json"
LOGO_ALIASES_PATH = REPO_ROOT / "lib" / "data" / "logo-aliases.json"
PARENT_THRESHOLD = float(os.environ.get("CATEGORY_PARENT_THRESHOLD", 0.55))
LEAF_THRESHOLD = float(os.environ.get("CATEGORY_LEAF_THRESHOLD", 0.60))


def normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def load_bank_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    if LOGO_ALIASES_PATH.exists():
        logo = json.loads(LOGO_ALIASES_PATH.read_text(encoding="utf-8"))
        for key, slug in logo.get("bank", {}).items():
            aliases[normalize(key)] = slug
    if CATALOG_NAMES_PATH.exists():
        for entry in json.loads(CATALOG_NAMES_PATH.read_text(encoding="utf-8")):
            slug = entry.get("slug")
            name = entry.get("name")
            if slug and name:
                aliases[normalize(name)] = slug
    if ALIASES_PATH.exists():
        for key, slug in json.loads(ALIASES_PATH.read_text(encoding="utf-8")).items():
            aliases[normalize(key)] = slug
    return aliases


def load_hierarchy() -> tuple[
    list[str],
    list[str],
    dict[str, str],
    dict[str, str],
    dict[str, str],
    dict[str, list[int]],
]:
    hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
    subcategory_names = hierarchy["subcategory_names"]
    parents = [p["name"] for p in hierarchy.get("parents", [])]
    leaf_to_parent = hierarchy["subcategory_to_parent"]
    normalized_to_leaf = {normalize(name): name for name in subcategory_names}
    normalized_to_parent = {
        normalize(parent["name"]): parent["name"]
        for parent in hierarchy.get("parents", [])
    }
    parent_to_child_indices: dict[str, list[int]] = {}
    for idx, leaf in enumerate(subcategory_names):
        parent = leaf_to_parent.get(normalize(leaf))
        if parent:
            parent_to_child_indices.setdefault(parent, []).append(idx)
    return (
        subcategory_names,
        parents,
        leaf_to_parent,
        normalized_to_leaf,
        normalized_to_parent,
        parent_to_child_indices,
    )


def resolve_two_stage(
    raw: str,
    bank_category: str,
    *,
    leaf_to_parent: dict[str, str],
    normalized_to_leaf: dict[str, str],
    normalized_to_parent: dict[str, str],
    parent_synonyms: dict[str, str],
    overrides: dict[str, str],
    migration: dict[str, str],
    parent_names: list[str],
    parent_embeddings: np.ndarray,
    subcategory_names: list[str],
    subcategory_embeddings: np.ndarray,
    parent_to_child_indices: dict[str, list[int]],
    model: SentenceTransformer,
) -> tuple[str | None, str | None, bool]:
    for candidate in (raw, bank_category):
        if not candidate:
            continue
        key = normalize(candidate)

        if key in overrides:
            leaf = overrides[key]
            return leaf, leaf_to_parent.get(normalize(leaf)), False

        if key in parent_synonyms:
            parent = parent_synonyms[key]
            return parent, parent, True

        if key in normalized_to_parent:
            parent = normalized_to_parent[key]
            return parent, parent, True

        if key in normalized_to_leaf:
            leaf = normalized_to_leaf[key]
            return leaf, leaf_to_parent.get(key), False

        if key in migration:
            leaf = migration[key]
            return leaf, leaf_to_parent.get(normalize(leaf)), False

    query_text = bank_category or raw
    q = model.encode([query_text], normalize_embeddings=True, show_progress_bar=False)[0]

    p_idx = int(np.argmax(np.dot(parent_embeddings, q)))
    p_score = float(np.dot(parent_embeddings[p_idx], q))
    if p_score < PARENT_THRESHOLD:
        return None, None, False

    parent = parent_names[p_idx]
    child_indices = parent_to_child_indices.get(parent, [])
    if child_indices:
        sub_embs = subcategory_embeddings[child_indices]
        l_local = int(np.argmax(np.dot(sub_embs, q)))
        l_score = float(sub_embs[l_local] @ q)
        if l_score >= LEAF_THRESHOLD:
            leaf = subcategory_names[child_indices[l_local]]
            if normalize(raw) == normalize(leaf) or normalize(raw) != normalize(bank_category):
                return leaf, parent, False

    return parent, parent, True


def build_catalog(offers: list[dict], aliases: dict[str, str]) -> dict:
    (
        subcategory_names,
        parents,
        leaf_to_parent,
        normalized_to_leaf,
        normalized_to_parent,
        parent_to_child_indices,
    ) = load_hierarchy()
    overrides = {
        normalize(key): value
        for key, value in json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")).items()
    }
    migration = {
        normalize(key): value
        for key, value in json.loads(MIGRATION_PATH.read_text(encoding="utf-8")).items()
    }
    parent_synonyms = {}
    if PARENT_SYNONYMS_PATH.exists():
        parent_synonyms = {
            normalize(key): value
            for key, value in json.loads(PARENT_SYNONYMS_PATH.read_text(encoding="utf-8")).items()
        }

    enriched = json.loads(ENRICHED_PATH.read_text(encoding="utf-8"))
    parent_embedding_texts = [enriched[name]["embedding_text"] for name in parents]
    model_name = os.environ.get(
        "SENTENCE_TRANSFORMER_MODEL",
        "paraphrase-multilingual-MiniLM-L12-v2",
    )
    model = SentenceTransformer(model_name)
    parent_embeddings = model.encode(
        parent_embedding_texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    subcategory_embeddings = model.encode(
        subcategory_names,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    catalog: dict[str, dict[str, dict]] = {}
    unmapped: set[str] = set()
    skipped_banks: set[str] = set()

    def add_entry(slug: str, raw: str, bank_category: str, match_level: str) -> None:
        if not raw:
            return
        sub, parent, is_macro = resolve_two_stage(
            raw,
            bank_category,
            leaf_to_parent=leaf_to_parent,
            normalized_to_leaf=normalized_to_leaf,
            normalized_to_parent=normalized_to_parent,
            parent_synonyms=parent_synonyms,
            overrides=overrides,
            migration=migration,
            parent_names=parents,
            parent_embeddings=parent_embeddings,
            subcategory_names=subcategory_names,
            subcategory_embeddings=subcategory_embeddings,
            parent_to_child_indices=parent_to_child_indices,
            model=model,
        )
        if sub is None:
            unmapped.add(f"{bank_category} / {raw}")
        catalog.setdefault(slug, {})[raw] = {
            "bank_category": bank_category,
            "unified_subcategory": sub,
            "unified_parent": parent,
            "unified": sub,
            "match_level": match_level,
            "is_macro": is_macro,
        }

    for offer in offers:
        bank = offer.get("bank", "")
        slug = aliases.get(normalize(bank))
        if not slug:
            skipped_banks.add(bank)
            continue
        category_name = offer.get("category_name", "")
        add_entry(slug, normalize(category_name), category_name, "category")
        for sub in offer.get("subcategories") or []:
            if normalize(sub) == normalize(category_name):
                continue
            add_entry(slug, normalize(sub), category_name, "subcategory")

    if skipped_banks:
        print("WARN: no slug for banks:", ", ".join(sorted(skipped_banks)), file=sys.stderr)
    if unmapped:
        print("WARN: unmapped entries (add to overrides):", file=sys.stderr)
        for name in sorted(unmapped):
            print(f"  - {name}", file=sys.stderr)

    return {
        slug: dict(sorted(entries.items()))
        for slug, entries in sorted(catalog.items())
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        nargs="?",
        default=str(DEFAULT_SOURCE),
        help="Path to cashback_offers.json",
    )
    args = parser.parse_args()
    source_path = Path(args.source)
    if not source_path.is_file():
        print(f"ERROR: file not found: {source_path}", file=sys.stderr)
        return 1

    if not HIERARCHY_PATH.is_file():
        print(f"ERROR: run sync_category_hierarchy.py first ({HIERARCHY_PATH})", file=sys.stderr)
        return 1

    if not ENRICHED_PATH.is_file():
        print(f"ERROR: run generate_parent_enriched.py first ({ENRICHED_PATH})", file=sys.stderr)
        return 1

    offers = json.loads(source_path.read_text(encoding="utf-8")).get("data", [])
    aliases = load_bank_aliases()
    catalog = build_catalog(offers, aliases)
    CATALOG_PATH.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    entry_count = sum(len(entries) for entries in catalog.values())
    print(f"Wrote {CATALOG_PATH} ({len(catalog)} banks, {entry_count} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
