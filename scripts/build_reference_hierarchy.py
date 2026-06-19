from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

_MARKER_RE = re.compile(r"[├└]── ")
_FOOTNOTE_RE = re.compile(r"\[\^\d+\]")
_NAME_PARENS_RE = re.compile(r"^(?P<name>[^()]+?)\s*(?:\((?P<examples>.*)\))?\s*$")


def _clean_text(raw: str) -> str:
    text = _FOOTNOTE_RE.sub("", raw)
    text = text.replace("*", " ")
    return " ".join(text.split())


def _split_name_examples(raw: str) -> tuple[str, list[str]]:
    cleaned = _clean_text(raw)
    match = _NAME_PARENS_RE.match(cleaned)
    if not match:
        return cleaned, []
    name = match.group("name").strip()
    examples_raw = match.group("examples")
    if not examples_raw:
        return name, []
    parts = re.split(r"[,:]", examples_raw)
    examples = [p.strip() for p in parts if p.strip()]
    return name, examples


def _iter_tree_blocks(md_text: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    inside = False
    current: list[str] = []
    for line in md_text.splitlines():
        if line.strip().startswith("```"):
            if inside:
                blocks.append(current)
                current = []
            inside = not inside
            continue
        if inside:
            current.append(line)
    return blocks


def _line_depth(line: str) -> int:
    """0 = первый уровень детей (маркер в начале), увеличивается с отступом."""
    match = _MARKER_RE.search(line)
    prefix = line[: match.start()]
    normalized = prefix.replace("│", " ")
    return len(normalized) // 4


def _extract_node_label(line: str) -> str:
    text = _MARKER_RE.sub("", line, count=1)
    return text.replace("│", "").strip()


def build_hierarchy(md_path: Path) -> dict:
    md_text = md_path.read_text(encoding="utf-8")
    blocks = _iter_tree_blocks(md_text)

    departments: list[dict] = []
    for block_index, block in enumerate(blocks, start=1):
        lines = [line for line in block if line.strip()]
        if not lines:
            continue
        department_id = f"d{block_index:02d}"
        department_name, department_examples = _split_name_examples(lines[0])
        department = {
            "id": department_id,
            "name": department_name,
            "examples": department_examples,
            "children": [],
        }
        stack: list[list] = [[-1, department, 0]]
        for line in lines[1:]:
            if not _MARKER_RE.search(line):
                continue
            depth = _line_depth(line)
            name, examples = _split_name_examples(_extract_node_label(line))
            while stack and stack[-1][0] >= depth:
                stack.pop()
            parent_entry = stack[-1]
            parent_node = parent_entry[1]
            parent_entry[2] += 1
            node_id = f"{parent_node['id']}.{parent_entry[2]}"
            node = {"id": node_id, "name": name, "examples": examples, "children": []}
            parent_node["children"].append(node)
            stack.append([depth, node, 0])
        departments.append(department)

    departments.append(
        {"id": "d99", "name": "Прочее", "examples": [], "children": []}
    )

    return {
        "version": "2.0",
        "source": "Эталонная иерархия категорий продуктов питания.md",
        "departments": departments,
        "fallback_node_id": "d99",
    }


def _collect_ids(nodes: list[dict], seen: set[str]) -> list[str]:
    duplicates: list[str] = []
    for node in nodes:
        if node["id"] in seen:
            duplicates.append(node["id"])
        seen.add(node["id"])
        duplicates.extend(_collect_ids(node.get("children", []), seen))
    return duplicates


def main() -> int:
    parser = argparse.ArgumentParser(description="Build reference_hierarchy.json from .md")
    parser.add_argument(
        "md_path",
        nargs="?",
        default=os.environ.get("REFERENCE_HIERARCHY_MD", ""),
        help="Path to source .md",
    )
    parser.add_argument("--out", default="", help="Output JSON path")
    parser.add_argument("--check", action="store_true", help="Validate only")
    args = parser.parse_args()

    if not args.md_path:
        print("error: provide md_path or set REFERENCE_HIERARCHY_MD", file=sys.stderr)
        return 2

    data = build_hierarchy(Path(args.md_path))
    duplicates = _collect_ids(data["departments"], set())
    if duplicates:
        print(f"error: duplicate ids: {duplicates}", file=sys.stderr)
        return 1

    if args.check:
        print(f"ok: {len(data['departments'])} departments, ids unique")
        return 0

    out_path = Path(args.out) if args.out else (
        Path(__file__).resolve().parent.parent
        / "backend" / "data" / "reference_hierarchy.json"
    )
    out_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
