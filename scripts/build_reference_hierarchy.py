#!/usr/bin/env python3
"""Build reference_hierarchy.json from markdown tree sections."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MD_PATH = ROOT.parent / "Эталонная иерархия категорий продуктов питания.md"
DEFAULT_OUTPUT_PATH = ROOT / "backend" / "data" / "reference_hierarchy.json"
SOURCE_NAME = "Эталонная иерархия категорий продуктов питания.md"
FALLBACK_DEPARTMENT = {"id": "d99", "name": "Прочее", "categories": [{"id": "d99.c01", "name": "Прочее", "subcategories": []}]}
FALLBACK_NODE_ID = "d99.c01"


def _collapse_spaces(value: str) -> str:
    return " ".join(value.strip().split())


def _strip_bullet_text(value: str) -> str:
    cleaned = re.sub(r"\s+\*$", "", value.strip())
    return _collapse_spaces(cleaned)


def _section_blocks(markdown_text: str) -> list[tuple[int, str]]:
    pattern = re.compile(
        r"^###\s+(\d+)\.\s+.*?\n```(?:[^\n]*)\n(.*?)\n```",
        flags=re.MULTILINE | re.DOTALL,
    )
    blocks: list[tuple[int, str]] = []
    for match in pattern.finditer(markdown_text):
        section_number = int(match.group(1))
        code_block = match.group(2)
        if 1 <= section_number <= 12:
            blocks.append((section_number, code_block))
    return sorted(blocks, key=lambda item: item[0])


def _parse_tree_block(code_block: str) -> tuple[str, list[dict[str, Any]]]:
    lines = [line.rstrip() for line in code_block.splitlines() if line.strip()]
    if not lines:
        raise ValueError("Tree block is empty")

    department_name = _strip_bullet_text(lines[0])
    categories: list[dict[str, Any]] = []
    category_by_depth: dict[int, dict[str, Any]] = {}
    category_names_seen: set[str] = set()
    subcategory_seen_by_category: dict[str, set[str]] = {}

    for raw_line in lines[1:]:
        node_match = re.match(r"^([│ ]*)([├└])──\s+(.*)$", raw_line)
        if not node_match:
            continue

        indentation = node_match.group(1)
        name = _strip_bullet_text(node_match.group(3))
        if not name:
            continue

        depth = len(indentation) // 4 + 1
        if depth == 1:
            if name in category_names_seen:
                continue
            category = {"name": name, "subcategories": []}
            categories.append(category)
            category_by_depth[1] = category
            category_names_seen.add(name)
            subcategory_seen_by_category[name] = set()
            continue

        owning_category = None
        for level in range(depth - 1, 0, -1):
            if level in category_by_depth:
                owning_category = category_by_depth[level]
                break
        if owning_category is None:
            continue

        owner_name = owning_category["name"]
        seen_set = subcategory_seen_by_category.setdefault(owner_name, set())
        if name in seen_set:
            continue
        owning_category["subcategories"].append({"name": name})
        seen_set.add(name)

    if not categories:
        raise ValueError(f"No categories parsed for department: {department_name}")

    return department_name, categories


def build_reference_hierarchy(markdown_path: Path) -> dict[str, Any]:
    markdown_text = markdown_path.read_text(encoding="utf-8")
    blocks = _section_blocks(markdown_text)
    if len(blocks) != 12:
        raise ValueError(f"Expected 12 department tree blocks, found {len(blocks)}")

    departments: list[dict[str, Any]] = []
    seen_department_numbers: set[int] = set()

    for section_number, block in blocks:
        seen_department_numbers.add(section_number)
        department_id = f"d{section_number:02d}"
        department_name, parsed_categories = _parse_tree_block(block)
        categories = []
        for category_index, category in enumerate(parsed_categories, start=1):
            category_id = f"{department_id}.c{category_index:02d}"
            subcategories = [
                {"id": f"{category_id}.s{sub_index:02d}", "name": subcategory["name"]}
                for sub_index, subcategory in enumerate(category["subcategories"], start=1)
            ]
            categories.append({"id": category_id, "name": category["name"], "subcategories": subcategories})
        departments.append({"id": department_id, "name": department_name, "categories": categories})

    expected_numbers = set(range(1, 13))
    if seen_department_numbers != expected_numbers:
        missing = sorted(expected_numbers - seen_department_numbers)
        raise ValueError(f"Missing numbered sections: {missing}")

    hierarchy = {
        "version": "1.0",
        "source": SOURCE_NAME,
        "departments": departments + [FALLBACK_DEPARTMENT],
        "fallback_node_id": FALLBACK_NODE_ID,
    }
    return hierarchy


def validate_hierarchy(hierarchy: dict[str, Any]) -> tuple[int, int, int]:
    ids: set[str] = set()
    duplicate_ids: set[str] = set()

    departments = hierarchy.get("departments", [])
    real_departments = [dept for dept in departments if dept.get("id") != "d99"]

    if len(real_departments) != 12:
        raise ValueError(f"Expected 12 real departments, found {len(real_departments)}")

    fallback_node_id = hierarchy.get("fallback_node_id")
    fallback_found = False

    category_count = 0
    subcategory_count = 0
    for department in departments:
        department_id = department.get("id")
        if department_id:
            if department_id in ids:
                duplicate_ids.add(department_id)
            ids.add(department_id)

        for category in department.get("categories", []):
            category_count += 1
            category_id = category.get("id")
            if category_id:
                if category_id in ids:
                    duplicate_ids.add(category_id)
                ids.add(category_id)
            if category_id == fallback_node_id:
                fallback_found = True

            for subcategory in category.get("subcategories", []):
                subcategory_count += 1
                subcategory_id = subcategory.get("id")
                if subcategory_id:
                    if subcategory_id in ids:
                        duplicate_ids.add(subcategory_id)
                    ids.add(subcategory_id)
                if subcategory_id == fallback_node_id:
                    fallback_found = True

    if duplicate_ids:
        duplicates = ", ".join(sorted(duplicate_ids))
        raise ValueError(f"Duplicate ids found: {duplicates}")
    if not fallback_found:
        raise ValueError(f"Fallback node id does not exist: {fallback_node_id}")

    return len(real_departments), category_count, subcategory_count


def _resolve_markdown_path(input_path_arg: str | None) -> Path:
    env_path = os.getenv("REFERENCE_HIERARCHY_MD")
    selected = input_path_arg or env_path or str(DEFAULT_MD_PATH)
    return Path(selected).expanduser().resolve()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build reference hierarchy JSON from markdown tree blocks.")
    parser.add_argument("--input", type=str, help="Path to the source markdown file.")
    parser.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_OUTPUT_PATH),
        help="Path to output reference_hierarchy.json.",
    )
    parser.add_argument("--check", action="store_true", help="Validate existing output JSON and exit.")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    output_path = Path(args.output).expanduser().resolve()

    if args.check:
        if not output_path.exists():
            print(f"ERROR: output file does not exist: {output_path}", file=sys.stderr)
            return 1
        hierarchy = json.loads(output_path.read_text(encoding="utf-8"))
        real_departments, category_count, subcategory_count = validate_hierarchy(hierarchy)
        print(
            f"OK: validated {output_path} "
            f"(departments={real_departments}, categories={category_count}, subcategories={subcategory_count})"
        )
        return 0

    markdown_path = _resolve_markdown_path(args.input)
    if not markdown_path.exists():
        print(f"ERROR: markdown file does not exist: {markdown_path}", file=sys.stderr)
        return 1

    hierarchy = build_reference_hierarchy(markdown_path)
    real_departments, category_count, subcategory_count = validate_hierarchy(hierarchy)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(hierarchy, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"WROTE: {output_path} "
        f"(departments={real_departments}, categories={category_count}, subcategories={subcategory_count})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
