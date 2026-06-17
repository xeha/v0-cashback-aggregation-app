#!/usr/bin/env python3
"""Generate backend/data/bank_category_catalog.json from cashback_offers.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = (
    REPO_ROOT.parent / "sync_category_subcategory" / "cashback_offers.json"
)
HIERARCHY_PATH = REPO_ROOT / "backend" / "data" / "category_hierarchy.json"
MIGRATION_PATH = REPO_ROOT / "backend" / "data" / "taxonomy_migration.json"
OVERRIDES_PATH = REPO_ROOT / "backend" / "data" / "bank_category_unified_overrides.json"
ALIASES_PATH = REPO_ROOT / "backend" / "data" / "bank_aliases.json"
PARENT_SYNONYMS_PATH = REPO_ROOT / "backend" / "data" / "parent_category_synonyms.json"
CATALOG_PATH = REPO_ROOT / "backend" / "data" / "bank_category_catalog.json"
CATALOG_NAMES_PATH = REPO_ROOT / "lib" / "data" / "bank-catalog.json"
LOGO_ALIASES_PATH = REPO_ROOT / "lib" / "data" / "logo-aliases.json"


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


def load_hierarchy() -> tuple[set[str], dict[str, str], dict[str, str], dict[str, str]]:
    hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
    leaves = set(hierarchy["subcategory_names"])
    leaf_to_parent = hierarchy["subcategory_to_parent"]
    normalized_to_leaf = {normalize(name): name for name in leaves}
    normalized_to_parent = {
        normalize(parent["name"]): parent["name"]
        for parent in hierarchy.get("parents", [])
    }
    return leaves, leaf_to_parent, normalized_to_leaf, normalized_to_parent


def resolve_cashpack_leaf(
    raw: str,
    bank_category: str,
    leaves: set[str],
    leaf_to_parent: dict[str, str],
    normalized_to_leaf: dict[str, str],
    normalized_to_parent: dict[str, str],
    parent_synonyms: dict[str, str],
    overrides: dict[str, str],
    migration: dict[str, str],
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

    return None, None, False


def build_catalog(offers: list[dict], aliases: dict[str, str]) -> dict:
    leaves, leaf_to_parent, normalized_to_leaf, normalized_to_parent = load_hierarchy()
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
    catalog: dict[str, dict[str, dict]] = {}
    unmapped: set[str] = set()
    skipped_banks: set[str] = set()

    def add_entry(slug: str, raw: str, bank_category: str, match_level: str) -> None:
        if not raw:
            return
        sub, parent, is_macro = resolve_cashpack_leaf(
            raw,
            bank_category,
            leaves,
            leaf_to_parent,
            normalized_to_leaf,
            normalized_to_parent,
            parent_synonyms,
            overrides,
            migration,
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
