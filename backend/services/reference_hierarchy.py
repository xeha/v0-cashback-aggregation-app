from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from services import catalog_store


@dataclass(frozen=True)
class ReferenceNode:
    id: str
    name: str
    examples: tuple[str, ...]
    parent_id: str | None
    department_id: str
    path_ids: tuple[str, ...]
    path_names: tuple[str, ...]

    @property
    def level(self) -> int:
        return len(self.path_ids)


class ReferenceHierarchy:
    def __init__(self) -> None:
        self._nodes_by_id: dict[str, ReferenceNode] = {}
        self._name_index: dict[str, str] = {}
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
        if path is not None:
            raw_data = json.loads(path.read_text(encoding="utf-8"))
        else:
            raw_data = catalog_store.get("reference_hierarchy")

        departments = raw_data.get("departments")
        fallback_node_id = raw_data.get("fallback_node_id")
        if not isinstance(departments, list):
            raise ValueError("Invalid reference hierarchy: departments must be a list")
        if not isinstance(fallback_node_id, str) or not fallback_node_id:
            raise ValueError("Invalid reference hierarchy: fallback_node_id is required")

        nodes_by_id: dict[str, ReferenceNode] = {}
        name_index: dict[str, str] = {}
        department_names: list[str] = []

        for department in departments:
            department_id = str(department["id"])
            department_names.append(str(department["name"]))
            self._walk(
                department,
                parent_id=None,
                department_id=department_id,
                path_ids=(),
                path_names=(),
                nodes_by_id=nodes_by_id,
                name_index=name_index,
            )

        if fallback_node_id not in nodes_by_id:
            raise ValueError(
                f"Invalid reference hierarchy: fallback node {fallback_node_id!r} not found"
            )

        self._nodes_by_id = nodes_by_id
        self._name_index = name_index
        self._department_order = department_names
        self._fallback_node_id = fallback_node_id

    def _walk(
        self,
        raw_node: dict,
        *,
        parent_id: str | None,
        department_id: str,
        path_ids: tuple[str, ...],
        path_names: tuple[str, ...],
        nodes_by_id: dict[str, ReferenceNode],
        name_index: dict[str, str],
    ) -> None:
        node_id = str(raw_node["id"])
        name = str(raw_node["name"])
        if node_id in nodes_by_id:
            raise ValueError(f"Duplicate reference node id: {node_id}")
        new_path_ids = path_ids + (node_id,)
        new_path_names = path_names + (name,)
        examples = tuple(str(e) for e in raw_node.get("examples", []))
        nodes_by_id[node_id] = ReferenceNode(
            id=node_id,
            name=name,
            examples=examples,
            parent_id=parent_id,
            department_id=department_id,
            path_ids=new_path_ids,
            path_names=new_path_names,
        )
        name_index.setdefault(_normalize(name), node_id)
        for child in raw_node.get("children", []):
            self._walk(
                child,
                parent_id=node_id,
                department_id=department_id,
                path_ids=new_path_ids,
                path_names=new_path_names,
                nodes_by_id=nodes_by_id,
                name_index=name_index,
            )

    def get_node(self, node_id: str) -> ReferenceNode | None:
        return self._nodes_by_id.get(node_id)

    def find_by_name(self, name: str) -> ReferenceNode | None:
        node_id = self._name_index.get(_normalize(name))
        return self._nodes_by_id.get(node_id) if node_id else None

    def ancestors_and_self(self, node_id: str) -> list[ReferenceNode]:
        node = self._nodes_by_id.get(node_id)
        if node is None:
            return []
        return [self._nodes_by_id[pid] for pid in node.path_ids]

    def iter_nodes(self) -> list[ReferenceNode]:
        return list(self._nodes_by_id.values())

    def department_order(self) -> list[str]:
        return list(self._department_order)


def _normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())
