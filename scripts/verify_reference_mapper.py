#!/usr/bin/env python3
"""Live verification for ReferenceMapperService."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.category_text_utils import sanitize_category  # noqa: E402
from services.reference_mapper_service import ReferenceMapperService  # noqa: E402


@dataclass(frozen=True)
class VerifyCase:
    raw: str
    expected_department: str
    expected_labels: tuple[str, ...]
    expected_depths: tuple[int, ...]


CASES = (
    VerifyCase(
        raw="Кисломолочка",
        expected_department="Молочные продукты и яйца",
        expected_labels=("Кисломолочные продукты",),
        expected_depths=(2,),
    ),
    VerifyCase(
        raw="Молоко сыр яйца",
        expected_department="Молочные продукты и яйца",
        expected_labels=("Молочные продукты и яйца",),
        expected_depths=(1,),
    ),
    VerifyCase(
        raw="Молоко",
        expected_department="Молочные продукты и яйца",
        expected_labels=(
            "Молоко (пастеризованное, ультрапастеризованное, топлёное)",
            "Молоко и молочные напитки",
        ),
        expected_depths=(3, 2),
    ),
    VerifyCase(
        raw="Твёрдые сыры",
        expected_department="Молочные продукты и яйца",
        expected_labels=(
            "Твёрдые и полутвёрдые сыры (Гауда, Эдам, Маасдам, Российский, Пармезан, Чеддер)",
            "Сыры",
        ),
        expected_depths=(3, 2),
    ),
    VerifyCase(
        raw="Замороженные продукты",
        expected_department="Замороженные продукты",
        expected_labels=("Замороженные продукты",),
        expected_depths=(1,),
    ),
    VerifyCase(
        raw="Шоколад конфеты сладости",
        expected_department="Снеки и кондитерские изделия",
        expected_labels=("Шоколад и шоколадные изделия",),
        expected_depths=(2,),
    ),
    VerifyCase(
        raw="Йогурты и молочные десерты",
        expected_department="Молочные продукты и яйца",
        expected_labels=(
            "Йогурты",
            "Кисломолочные продукты",
            "Творожные десерты",
            "Творог и творожные изделия",
        ),
        expected_depths=(3, 2),
    ),
    VerifyCase(
        raw="5% Макароны",
        expected_department="Бакалея",
        expected_labels=("Макаронные изделия",),
        expected_depths=(2,),
    ),
)


def _format_expectations(case: VerifyCase) -> str:
    return (
        f"dept={case.expected_department!r}, "
        f"display in {case.expected_labels!r}, "
        f"depth in {case.expected_depths!r}"
    )


def _format_actual(item) -> str:
    return (
        f"dept={item.reference_department!r}, "
        f"display={item.display_label!r}, "
        f"depth={item.reference_depth!r}, "
        f"source={item.match_source!r}, "
        f"confidence={item.confidence:.3f}"
    )


def _load_backend_env() -> None:
    env_path = BACKEND / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main() -> int:
    _load_backend_env()

    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        print("BLOCKED: MISTRAL_API_KEY is missing in backend/.env")
        return 2

    mapper = ReferenceMapperService()
    mapper.load()

    failed = 0
    for case in CASES:
        sanitized = sanitize_category(case.raw)
        mapped = mapper.map_items(
            [CategoryMapRequestItem(raw_category=sanitized.display, rate=10.0)],
            source_name="Магнит",
            normalized_by_item=[sanitized.normalized_key],
        )[0]

        is_ok = (
            mapped.reference_department == case.expected_department
            and (mapped.display_label or "") in case.expected_labels
            and mapped.reference_depth in case.expected_depths
        )
        status = "PASS" if is_ok else "FAIL"
        print(f"{status}: {case.raw!r}")
        print(f"  expected: {_format_expectations(case)}")
        print(f"  actual:   {_format_actual(mapped)}")
        if not is_ok:
            failed += 1

    cache_sanitized = sanitize_category("Кисломолочка")
    cache_mapper = ReferenceMapperService()
    cache_mapper.load()
    first = cache_mapper.map_items(
        [CategoryMapRequestItem(raw_category=cache_sanitized.display, rate=7.0)],
        source_name="Магнит",
        normalized_by_item=[cache_sanitized.normalized_key],
    )[0]
    second = cache_mapper.map_items(
        [CategoryMapRequestItem(raw_category=cache_sanitized.display, rate=7.0)],
        source_name="Магнит",
        normalized_by_item=[cache_sanitized.normalized_key],
    )[0]

    cache_ok = first.match_source != "reference_cache" and second.match_source == "reference_cache"
    print(
        f"{'PASS' if cache_ok else 'FAIL'}: cache repeat "
        f"(first={first.match_source!r}, second={second.match_source!r})"
    )
    if not cache_ok:
        failed += 1

    if failed:
        print(f"\n{failed} checks failed")
        return 1

    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
