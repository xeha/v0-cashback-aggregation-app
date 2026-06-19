from pathlib import Path

from scripts.build_reference_hierarchy import build_hierarchy

FIXTURE = Path(__file__).parent / "fixtures" / "mini_hierarchy.md"


def _find(nodes, name):
    for node in nodes:
        if node["name"] == name:
            return node
        found = _find(node.get("children", []), name)
        if found:
            return found
    return None


def test_departments_parsed_in_order():
    data = build_hierarchy(FIXTURE)
    names = [d["name"] for d in data["departments"] if d["id"] != "d99"]
    assert names == ["Напитки", "Мясо и птица"]


def test_department_ids_are_sequential():
    data = build_hierarchy(FIXTURE)
    assert data["departments"][0]["id"] == "d01"
    assert data["departments"][1]["id"] == "d02"


def test_nesting_depth_preserved():
    data = build_hierarchy(FIXTURE)
    alcohol = _find(data["departments"], "Алкогольные напитки")
    beer = _find([alcohol], "Пиво и пивные напитки")
    assert _find(beer["children"], "Светлое пиво") is not None


def test_parentheses_extracted_to_examples():
    data = build_hierarchy(FIXTURE)
    water = _find(data["departments"], "Минеральная вода")
    assert water["name"] == "Минеральная вода"
    assert "Ессентуки" in water["examples"]
    assert "Боржоми" in water["examples"]


def test_fallback_department_appended():
    data = build_hierarchy(FIXTURE)
    assert data["fallback_node_id"] == "d99"
    assert _find(data["departments"], "Прочее") is not None


def test_child_ids_are_dotted_paths():
    data = build_hierarchy(FIXTURE)
    napitki = data["departments"][0]
    voda = _find([napitki], "Вода")
    assert voda["id"].startswith("d01.")
    for child in voda["children"]:
        assert child["id"].startswith(voda["id"] + ".")
