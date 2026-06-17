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
TAXONOMY_PATH = REPO_ROOT / "backend" / "data" / "taxonomy.json"
OVERRIDES_PATH = REPO_ROOT / "backend" / "data" / "bank_category_unified_overrides.json"
ALIASES_PATH = REPO_ROOT / "backend" / "data" / "bank_aliases.json"
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


def resolve_unified(
    bank_category: str,
    taxonomy: set[str],
    overrides: dict[str, str],
) -> str | None:
    if bank_category in taxonomy:
        return bank_category
    key = normalize(bank_category)
    return overrides.get(key)


def build_catalog(offers: list[dict], aliases: dict[str, str]) -> dict:
    taxonomy_list = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    taxonomy = set(taxonomy_list)
    overrides = {
        normalize(key): value
        for key, value in json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")).items()
    }
    catalog: dict[str, dict[str, dict]] = {}
    unmapped: set[str] = set()
    skipped_banks: set[str] = set()

    def add_entry(slug: str, raw: str, bank_category: str, match_level: str) -> None:
        if not raw:
            return
        unified = resolve_unified(bank_category, taxonomy, overrides)
        if unified is None:
            unmapped.add(bank_category)
        catalog.setdefault(slug, {})[raw] = {
            "bank_category": bank_category,
            "unified": unified,
            "match_level": match_level,
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
        print("WARN: unmapped bank categories (add to overrides):", file=sys.stderr)
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
