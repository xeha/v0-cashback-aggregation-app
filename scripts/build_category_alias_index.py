#!/usr/bin/env python3
"""Generate token-order alias variants from market_cashback_consensus.json."""

from __future__ import annotations

import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONSENSUS_PATH = ROOT / "backend" / "data" / "archive" / "market_cashback_consensus.json"
ALIASES_PATH = ROOT / "backend" / "data" / "market_category_aliases.json"


def _normalize_key(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _permutations_for_key(key: str) -> list[str]:
    tokens = [token for token in _normalize_key(key).split() if token != "и"]
    if len(tokens) < 2 or len(tokens) > 3:
        return []
    variants: list[str] = []
    for perm in itertools.permutations(tokens):
        variant = " ".join(perm)
        if variant != _normalize_key(key):
            variants.append(variant)
    return variants


def main() -> None:
    consensus: list[dict] = json.loads(CONSENSUS_PATH.read_text(encoding="utf-8"))
    aliases: dict[str, str] = json.loads(ALIASES_PATH.read_text(encoding="utf-8"))

    generated = 0
    for row in consensus:
        canonical = _normalize_key(row["key"])
        for variant in _permutations_for_key(canonical):
            aliases.setdefault(variant, canonical)
            generated += 1

    ALIASES_PATH.write_text(
        json.dumps(aliases, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {ALIASES_PATH} ({generated} permutation variants considered)")


if __name__ == "__main__":
    main()
