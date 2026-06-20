from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.reference_hierarchy import ReferenceHierarchy  # noqa: E402


def main() -> int:
    h = ReferenceHierarchy()
    h.load()
    failures: list[str] = []

    for name in ["Алкогольные напитки", "Прочее"]:
        node = h.find_by_name(name)
        if node is None:
            failures.append(f"node not found: {name}")
            continue
        ancestors = h.ancestors_and_self(node.id)
        if ancestors[0].department_id != node.department_id:
            failures.append(f"path root mismatch: {name}")

    if h.fallback_node_id != "d99":
        failures.append("fallback is not d99")

    if failures:
        print("FAIL:")
        for f in failures:
            print(" -", f)
        return 1
    print("OK: offline reference checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
