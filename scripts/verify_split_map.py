from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.market_split_map_service import MarketSplitMapService  # noqa: E402

CASES = [
    ("Пиво и сидр", "Магнит", 2, "Напитки"),
    ("Молоко и сливки", "Магнит", 2, "Молочные продукты и яйца"),
    ("Мясо и птица", "Лента", 1, "Мясо и птица"),
    ("Кисломолочка", "Магнит", 1, "Молочные продукты и яйца"),
    ("Замороженные продукты", "Лента", 1, "Замороженные продукты"),
]


def run_model(model: str) -> int:
    os.environ["MISTRAL_CLASSIFIER_MODEL"] = model
    service = MarketSplitMapService()
    service.load()
    passed = 0
    for raw, store, expected_parts, expected_dept in CASES:
        items = service.map_items(
            [CategoryMapRequestItem(raw_category=raw, rate=5.0)],
            source_name=store,
            normalized_by_item=[raw.lower()],
        )
        depts = {i.reference_department for i in items}
        ok = len(items) >= expected_parts and expected_dept in depts
        passed += int(ok)
        status = "OK " if ok else "FAIL"
        print(f"[{model}] {status} {raw!r} -> {len(items)} parts, depts={depts}")
    print(f"[{model}] {passed}/{len(CASES)} passed\n")
    return passed


def main() -> int:
    if not os.environ.get("MISTRAL_API_KEY"):
        print("MISTRAL_API_KEY not set — skipping live verify")
        return 0
    models = os.environ.get(
        "VERIFY_MODELS", "mistral-small-latest,mistral-medium-latest,mistral-large-latest"
    ).split(",")
    for model in models:
        run_model(model.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
