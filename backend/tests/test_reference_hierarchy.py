from pathlib import Path

from services.reference_hierarchy import ReferenceHierarchy

FIXTURE_JSON = Path(__file__).parent / "fixtures" / "mini_hierarchy.json"


def _hierarchy() -> ReferenceHierarchy:
    h = ReferenceHierarchy()
    h.load(FIXTURE_JSON)
    return h


def test_loads_all_nodes():
    h = _hierarchy()
    assert h.is_loaded
    assert h.get_node("d01") is not None


def test_node_has_path_from_department():
    h = _hierarchy()
    beer = h.find_by_name("Светлое пиво")
    path_names = [n.name for n in h.ancestors_and_self(beer.id)]
    assert path_names[0] == "Напитки"
    assert path_names[-1] == "Светлое пиво"
    assert "Алкогольные напитки" in path_names


def test_department_id_is_root_of_path():
    h = _hierarchy()
    beer = h.find_by_name("Светлое пиво")
    assert h.get_node(beer.id).department_id == "d01"


def test_level_equals_path_length():
    h = _hierarchy()
    voda = h.find_by_name("Вода")
    assert h.get_node(voda.id).level == 2


def test_fallback_node_resolves():
    h = _hierarchy()
    assert h.fallback_node_id == "d99"
    assert h.get_node("d99").name == "Прочее"


def test_department_order():
    h = _hierarchy()
    assert h.department_order()[:2] == ["Напитки", "Мясо и птица"]
