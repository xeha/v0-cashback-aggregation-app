from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

REFERENCE_HIERARCHY_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "reference_hierarchy.json"
)


@dataclass(frozen=True)
class ReferenceNode:
    id: str
    name: str
    level: Literal[1, 2, 3]
    department_id: str
    category_id: str | None
    path: tuple[str, ...]


class ReferenceHierarchy:
    def __init__(self) -> None:
        self._nodes_by_id: dict[str, ReferenceNode] = {}
        self._department_order: list[str] = []
        self._fallback_node_id = ""

    @property
    def is_loaded(self) -> bool:
        return bool(self._nodes_by_id)

    @property
    def fallback_node_id(self) -> str:
        if not self._fallback_node_id:
            raise RuntimeError("Reference hierarchy is not loaded")
        return self._fallback_node_id

    def load(self, path: Path | None = None) -> None:
        source_path = path or REFERENCE_HIERARCHY_PATH
        raw_data = json.loads(source_path.read_text(encoding="utf-8"))

        departments = raw_data.get("departments")
        fallback_node_id = raw_data.get("fallback_node_id")
        if not isinstance(departments, list):
            raise ValueError("Invalid reference hierarchy: departments must be a list")
        if not isinstance(fallback_node_id, str) or not fallback_node_id:
            raise ValueError("Invalid reference hierarchy: fallback_node_id is required")

        nodes_by_id: dict[str, ReferenceNode] = {}
        department_names: list[str] = []

        for department in departments:
            department_id = str(department["id"])
            department_name = str(department["name"])
            department_names.append(department_name)

            self._insert_node(
                nodes_by_id,
                ReferenceNode(
                    id=department_id,
                    name=department_name,
                    level=1,
                    department_id=department_id,
                    category_id=None,
                    path=(department_name,),
                ),
            )

            categories = department.get("categories", [])
            for category in categories:
                category_id = str(category["id"])
                category_name = str(category["name"])

                self._insert_node(
                    nodes_by_id,
                    ReferenceNode(
                        id=category_id,
                        name=category_name,
                        level=2,
                        department_id=department_id,
                        category_id=None,
                        path=(department_name, category_name),
                    ),
                )

                subcategories = category.get("subcategories", [])
                for subcategory in subcategories:
                    subcategory_id = str(subcategory["id"])
                    subcategory_name = str(subcategory["name"])
                    self._insert_node(
                        nodes_by_id,
                        ReferenceNode(
                            id=subcategory_id,
                            name=subcategory_name,
                            level=3,
                            department_id=department_id,
                            category_id=category_id,
                            path=(department_name, category_name, subcategory_name),
                        ),
                    )

        if fallback_node_id not in nodes_by_id:
            raise ValueError(
                f"Invalid reference hierarchy: fallback node {fallback_node_id!r} not found"
            )

        self._nodes_by_id = nodes_by_id
        self._department_order = department_names
        self._fallback_node_id = fallback_node_id

    def get_node(self, node_id: str) -> ReferenceNode | None:
        return self._nodes_by_id.get(node_id)

    def department_order(self) -> list[str]:
        return list(self._department_order)

    def _insert_node(
        self, nodes_by_id: dict[str, ReferenceNode], node: ReferenceNode
    ) -> None:
        if node.id in nodes_by_id:
            raise ValueError(f"Duplicate reference node id: {node.id}")
        nodes_by_id[node.id] = node


def resolve_display_node(
    hierarchy: ReferenceHierarchy, node_id: str, depth: int
) -> ReferenceNode:
    if depth not in (1, 2, 3):
        raise ValueError(f"Unsupported depth: {depth}")
    if not hierarchy.is_loaded:
        raise RuntimeError("Reference hierarchy is not loaded")

    node = hierarchy.get_node(node_id)
    if node is None:
        fallback = hierarchy.get_node(hierarchy.fallback_node_id)
        if fallback is None:
            raise RuntimeError("Fallback node is not available")
        node = fallback

    if depth == 1:
        department_node = hierarchy.get_node(node.department_id)
        if department_node is None:
            raise RuntimeError(f"Department node {node.department_id!r} not found")
        return department_node

    if depth == 2 and node.level == 3 and node.category_id:
        category_node = hierarchy.get_node(node.category_id)
        if category_node is None:
            raise RuntimeError(f"Category node {node.category_id!r} not found")
        return category_node

    return node
