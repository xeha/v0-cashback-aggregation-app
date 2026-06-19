# Market Category Split + LCA Comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Маппить market-категории с экранов магазинов в эталонное дерево продуктов: разбивать составные строки (1:N) через LLM, сопоставлять каждую часть в узел дерева и сравнивать магазины на динамическом общем предке (LCA) со строками-товарами.

**Architecture:** Бэкенд: пересборка справочника в дерево переменной глубины (`name` + `examples`), новый `MarketSplitMapService` (LLM split+map, 1:N), отдача `reference_path` по каждой части. Фронтенд: чистый модуль LCA (`lib/market-comparison.ts`) строит группы по отделу со спуском по покрытию магазинами; строка-якорь показывает диапазон ставок, под ней строки-товары.

**Tech Stack:** Python 3.11 / FastAPI / Pydantic v2 / Mistral; pytest (новое, для чистой логики и mock-LLM). Next.js 16 / TypeScript; vitest (новое, для LCA-логики).

**Спецификация:** `docs/superpowers/specs/2026-06-19-market-category-split-lca-design.md`

---

## Соглашения

- **Схема id узлов:** отдел `d01`…`d12`; дочерние узлы добавляют номер через точку: `d01.1`, `d01.1.1`, … (произвольная глубина). Fallback-отдел — `d99` «Прочее».
- **Путь к `.md`:** реальный источник вне репозитория — `/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/Эталонная иерархия категорий продуктов питания.md`. В тестах используется маленькая фикстура.
- **Запуск бэкенд-тестов:** `cd backend && python -m pytest -v`.
- **Запуск фронт-тестов:** `npx vitest run`.
- Все команды git выполняет инженер вручную на шаге Commit.

---

## Фаза A — Эталонное дерево и build-скрипт

### Task 1: Тестовый каркас backend (pytest)

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: Добавить pytest в зависимости**

В конец `backend/requirements.txt` добавить строку:

```
pytest>=8.3.0
```

- [ ] **Step 2: Установить**

Run: `cd backend && pip install -r requirements.txt`
Expected: `pytest` установлен (в выводе `Successfully installed ... pytest-8...`).

- [ ] **Step 3: Создать конфиг pytest**

`backend/pytest.ini`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
addopts = -q
```

- [ ] **Step 4: Создать пакет тестов и conftest**

`backend/tests/__init__.py` — пустой файл.

`backend/tests/conftest.py`:

```python
import sys
from pathlib import Path

# Позволяет импортировать модули backend (schemas, services) в тестах.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
```

- [ ] **Step 5: Проверить, что pytest стартует**

Run: `cd backend && python -m pytest -v`
Expected: `no tests ran` (collected 0 items) — без ошибок импорта/конфига.

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/pytest.ini backend/tests/__init__.py backend/tests/conftest.py
git commit -m "test: add pytest scaffolding for backend"
```

---

### Task 2: Парсер `.md` → вложенный JSON (build-скрипт)

**Files:**
- Create: `scripts/build_reference_hierarchy.py`
- Create: `backend/tests/fixtures/mini_hierarchy.md`
- Create: `backend/tests/test_build_reference_hierarchy.py`

- [ ] **Step 1: Создать фикстуру `.md`**

`backend/tests/fixtures/mini_hierarchy.md`:

````markdown
## Полная иерархия по отделам
### 1. Напитки
```
Напитки
├── Вода
│   ├── Минеральная вода (столовая, лечебно-столовая: Ессентуки, Боржоми)
│   └── Газированная вода (без вкуса и со вкусом)
├── Сладкие газированные напитки
│   ├── Кола (Coca-Cola, Pepsi и аналоги)
│   └── Лимонады и ситро
└── Алкогольные напитки
    ├── Пиво и пивные напитки
    │   ├── Светлое пиво
    │   └── Тёмное и нефильтрованное пиво
    └── Слабоалкогольные напитки (сидр, коктейли RTD)
```

### 2. Мясо и птица
```
Мясо и птица
├── Говядина
└── Птица
```
````

- [ ] **Step 2: Написать падающий тест парсера**

`backend/tests/test_build_reference_hierarchy.py`:

```python
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
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `cd backend && python -m pytest tests/test_build_reference_hierarchy.py -v`
Expected: FAIL с `ModuleNotFoundError: No module named 'scripts.build_reference_hierarchy'` (или ошибка импорта). Примечание: тест добавляет корень репо в путь — см. Step 4.

- [ ] **Step 4: Обеспечить импорт `scripts` из backend-тестов**

Дополнить `backend/tests/conftest.py` (добавить после существующего блока):

```python
REPO_ROOT = BACKEND_ROOT.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
```

Создать `scripts/__init__.py` (пустой), чтобы `scripts` был пакетом.

- [ ] **Step 5: Реализовать build-скрипт**

`scripts/build_reference_hierarchy.py`:

```python
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
        # Стек (depth, node_dict, child_counter) для восстановления вложенности.
        stack: list[list] = [[-1, department, 0]]
        for line in lines[1:]:
            if not _MARKER_RE.search(line):
                continue
            depth = _line_depth(line)
            name, examples = _split_name_examples(_MARKER_RE.sub("", line, count=1))
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
```

- [ ] **Step 6: Запустить тесты — убедиться, что проходят**

Run: `cd backend && python -m pytest tests/test_build_reference_hierarchy.py -v`
Expected: PASS (6 passed).

- [ ] **Step 7: Commit**

```bash
git add scripts/build_reference_hierarchy.py scripts/__init__.py backend/tests/conftest.py backend/tests/fixtures/mini_hierarchy.md backend/tests/test_build_reference_hierarchy.py
git commit -m "feat: add reference hierarchy build script (.md -> nested JSON)"
```

---

### Task 3: Перегенерировать `reference_hierarchy.json` из реального `.md`

**Files:**
- Modify: `backend/data/reference_hierarchy.json` (полная перезапись)

- [ ] **Step 1: Запустить build на реальном источнике**

Run:
```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app && \
python scripts/build_reference_hierarchy.py "/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/Эталонная иерархия категорий продуктов питания.md"
```
Expected: `wrote .../backend/data/reference_hierarchy.json`

- [ ] **Step 2: Проверить структуру результата**

Run:
```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app && \
python -c "import json;d=json.load(open('backend/data/reference_hierarchy.json'));print(len(d['departments']),'departments');print(d['departments'][8]['name'])"
```
Expected: `13 departments` (12 + Прочее) и девятый отдел (index 8) = `Напитки`.

- [ ] **Step 3: Проверить корректность дерева алкоголя (LCA-критично)**

Run:
```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app && \
python -c "
import json
d=json.load(open('backend/data/reference_hierarchy.json'))
def find(nodes,name):
    for n in nodes:
        if n['name']==name: return n
        r=find(n.get('children',[]),name)
        if r: return r
napitki=[x for x in d['departments'] if x['name']=='Напитки'][0]
alc=find([napitki],'Алкогольные напитки')
beer=find([alc],'Пиво и пивные напитки')
assert beer is not None, 'Пиво должно быть вложено в Алкогольные напитки'
assert find(beer['children'],'Светлое пиво') is not None
print('OK: alcohol subtree nested correctly')
"
```
Expected: `OK: alcohol subtree nested correctly`

- [ ] **Step 4: Commit**

```bash
git add backend/data/reference_hierarchy.json
git commit -m "data: regenerate reference_hierarchy.json as variable-depth tree with examples"
```

---

### Task 4: Переписать `reference_hierarchy.py` под дерево переменной глубины

**Files:**
- Modify: `backend/services/reference_hierarchy.py` (полная замена)
- Create: `backend/tests/test_reference_hierarchy.py`

- [ ] **Step 1: Написать падающие тесты дерева**

`backend/tests/test_reference_hierarchy.py`:

```python
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
    assert h.get_node(voda.id).level == 2  # Напитки > Вода


def test_fallback_node_resolves():
    h = _hierarchy()
    assert h.fallback_node_id == "d99"
    assert h.get_node("d99").name == "Прочее"


def test_department_order():
    h = _hierarchy()
    assert h.department_order()[:2] == ["Напитки", "Мясо и птица"]
```

- [ ] **Step 2: Сгенерировать JSON-фикстуру из mini `.md`**

Run:
```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app && \
python scripts/build_reference_hierarchy.py backend/tests/fixtures/mini_hierarchy.md --out backend/tests/fixtures/mini_hierarchy.json
```
Expected: `wrote backend/tests/fixtures/mini_hierarchy.json`

- [ ] **Step 3: Запустить тесты — убедиться, что падают**

Run: `cd backend && python -m pytest tests/test_reference_hierarchy.py -v`
Expected: FAIL (`find_by_name`/`ancestors_and_self` отсутствуют, старый загрузчик не читает `children`).

- [ ] **Step 4: Реализовать новый загрузчик дерева**

Полностью заменить содержимое `backend/services/reference_hierarchy.py`:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

REFERENCE_HIERARCHY_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "reference_hierarchy.json"
)


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
        source_path = path or REFERENCE_HIERARCHY_PATH
        raw_data = json.loads(source_path.read_text(encoding="utf-8"))

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
```

- [ ] **Step 5: Запустить тесты — убедиться, что проходят**

Run: `cd backend && python -m pytest tests/test_reference_hierarchy.py -v`
Expected: PASS (6 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/services/reference_hierarchy.py backend/tests/test_reference_hierarchy.py backend/tests/fixtures/mini_hierarchy.json
git commit -m "feat: variable-depth reference hierarchy tree with path/examples"
```

---

## Фаза B — Сервис split+map (backend)

### Task 5: Схемы — поля для частей и пути

**Files:**
- Modify: `backend/schemas.py:33-65`

- [ ] **Step 1: Добавить модель пути и поля в `MappedItem`**

В `backend/schemas.py` добавить новую модель перед `MappedItem` и расширить `MappedItem`. Заменить блок `class MappedItem(BaseModel): ...` (строки 33-65) на:

```python
class ReferencePathNode(BaseModel):
    id: str
    name: str


class MappedItem(BaseModel):
    raw_category: str
    normalized_raw_category: str | None = None
    normalize_source: Literal["sanitize", "passthrough"] | None = None
    split_text: str | None = None
    unified_category: str
    unified_subcategory: str | None = None
    unified_parent: str | None = None
    rate: float
    confidence: float
    is_bank_offer: bool = False
    is_macro_category: bool = False
    match_source: Literal[
        "catalog",
        "override",
        "parent",
        "named",
        "leaf_exact",
        "parent_embedding",
        "leaf_embedding",
        "coarse_cashback",
        "llm_parent",
        "fallback",
        "embedding",
        "reference_llm",
        "reference_cache",
        "reference_fallback",
        "reference_split_llm",
    ] | None = None
    display_label: str | None = None
    reference_node_id: str | None = None
    reference_department: str | None = None
    reference_category: str | None = None
    reference_subcategory: str | None = None
    reference_depth: int | None = None
    reference_path: list[ReferencePathNode] | None = None
```

(`reference_depth` стал свободным `int`, т.к. глубина теперь произвольная.)

- [ ] **Step 2: Проверить импортируемость**

Run: `cd backend && python -c "import schemas; print(schemas.ReferencePathNode(id='d01', name='X'))"`
Expected: `id='d01' name='X'` без ошибок.

- [ ] **Step 3: Commit**

```bash
git add backend/schemas.py
git commit -m "feat: add split_text and reference_path to MappedItem schema"
```

---

### Task 6: `MarketSplitMapService` (LLM split+map, 1:N)

**Files:**
- Create: `backend/services/market_split_map_service.py`
- Create: `backend/tests/test_market_split_map_service.py`

- [ ] **Step 1: Написать падающие тесты (LLM мокается)**

`backend/tests/test_market_split_map_service.py`:

```python
from pathlib import Path

from schemas import CategoryMapRequestItem
from services.market_split_map_service import MarketSplitMapService

FIXTURE_JSON = Path(__file__).parent / "fixtures" / "mini_hierarchy.json"


def _service(monkeypatch, llm_items):
    monkeypatch.setenv("MARKET_SPLIT_MAP_LLM_ENABLED", "true")
    service = MarketSplitMapService()
    service.load(path=FIXTURE_JSON)

    def fake_classify(batch, source_name):
        return llm_items

    monkeypatch.setattr(service, "_classify_batch", fake_classify)
    return service


def test_splits_compound_into_multiple_parts(monkeypatch):
    beer_id = _node_id("Светлое пиво")
    cider_id = _node_id("Слабоалкогольные напитки")
    service = _service(
        monkeypatch,
        {"Пиво и сидр": [
            {"split_text": "Пиво", "node_id": beer_id, "confidence": 0.95},
            {"split_text": "Сидр", "node_id": cider_id, "confidence": 0.9},
        ]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Пиво и сидр", rate=10.0)],
        source_name="Магнит",
        normalized_by_item=["пиво и сидр"],
    )
    assert len(items) == 2
    labels = {i.split_text for i in items}
    assert labels == {"Пиво", "Сидр"}
    assert all(i.raw_category == "Пиво и сидр" for i in items)


def test_single_node_not_split(monkeypatch):
    voda_id = _node_id("Вода")
    service = _service(
        monkeypatch,
        {"Вода": [{"split_text": "Вода", "node_id": voda_id, "confidence": 0.9}]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Вода", rate=5.0)],
        source_name="Лента",
        normalized_by_item=["вода"],
    )
    assert len(items) == 1
    assert items[0].reference_path[0].name == "Напитки"


def test_invalid_node_id_falls_back(monkeypatch):
    service = _service(
        monkeypatch,
        {"Хрень": [{"split_text": "Хрень", "node_id": "zzz", "confidence": 0.99}]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Хрень", rate=1.0)],
        source_name="X",
        normalized_by_item=["хрень"],
    )
    assert len(items) == 1
    assert items[0].match_source == "reference_fallback"
    assert items[0].reference_department == "Прочее"


def test_low_confidence_falls_back(monkeypatch):
    voda_id = _node_id("Вода")
    service = _service(
        monkeypatch,
        {"Вода": [{"split_text": "Вода", "node_id": voda_id, "confidence": 0.1}]},
    )
    items = service.map_items(
        [CategoryMapRequestItem(raw_category="Вода", rate=5.0)],
        source_name="X",
        normalized_by_item=["вода"],
    )
    assert items[0].match_source == "reference_fallback"


def test_cache_hit_second_call(monkeypatch):
    voda_id = _node_id("Вода")
    service = _service(
        monkeypatch,
        {"Вода": [{"split_text": "Вода", "node_id": voda_id, "confidence": 0.9}]},
    )
    args = (
        [CategoryMapRequestItem(raw_category="Вода", rate=5.0)],
        "X",
        ["вода"],
    )
    service.map_items(*args)
    second = service.map_items(*args)
    assert second[0].match_source == "reference_cache"


# helper for tests
_HELPER = MarketSplitMapService()
_HELPER.load(path=FIXTURE_JSON)


def _node_id(name: str) -> str:
    node = _HELPER._hierarchy.find_by_name(name)
    assert node is not None, name
    return node.id
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd backend && python -m pytest tests/test_market_split_map_service.py -v`
Expected: FAIL (`No module named 'services.market_split_map_service'`).

- [ ] **Step 3: Реализовать сервис**

`backend/services/market_split_map_service.py`:

```python
from __future__ import annotations

import json
import os
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from schemas import CategoryMapRequestItem, MappedItem, ReferencePathNode
from services.reference_hierarchy import ReferenceHierarchy

if TYPE_CHECKING:
    from mistralai.client import Mistral

MatchSource = Literal["reference_split_llm", "reference_cache", "reference_fallback"]

PROMPT_TEMPLATE = """Ты классификатор категорий кэшбэка супермаркетов.
Для каждой строки верни массив parts: один или несколько узлов эталонной иерархии.

Правила:
- Разбивай строку на несколько частей, ТОЛЬКО если она перечисляет разные товары/категории,
  которым соответствуют РАЗНЫЕ узлы (например "Пиво и сидр" -> Пиво + Сидр).
- НЕ разбивай, если вся фраза соответствует одному узлу, включая названия отделов
  ("Мясо и птица", "Овощи и фрукты" -> один узел-отдел).
- Для каждой части выбери самый конкретный узел, оправданный формулировкой; не углубляйся дальше.
- Отвечай строго node_id из списка, без выдумывания.

Супермаркет: {source_name}

Строки:
{item_lines}

Узлы (node_id | полный путь):
{node_lines}

Примеры:
- "Пиво и сидр" -> [{{"split_text":"Пиво","node_id":"<пиво>"}},{{"split_text":"Сидр","node_id":"<сидр>"}}]
- "Молоко и сливки" -> [{{"split_text":"Молоко","node_id":"<молоко>"}},{{"split_text":"Сливки","node_id":"<сливки>"}}]
- "Мясо и птица" -> [{{"split_text":"Мясо и птица","node_id":"<отдел>"}}]
- "Кисломолочка" -> [{{"split_text":"Кисломолочка","node_id":"<кисломолочные>"}}]

Верни ТОЛЬКО JSON:
{{"items":[{{"raw":"...","parts":[{{"split_text":"...","node_id":"...","confidence":0.95}}]}}]}}
"""

_JSON_FENCE_PREFIX_RE = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_JSON_FENCE_SUFFIX_RE = re.compile(r"\s*```$")


def _normalize_key(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _is_truthy_env(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).lower() in {"1", "true", "yes"}


def _parse_batch_size() -> int:
    try:
        return max(int(os.environ.get("MARKET_MAP_BATCH_SIZE", "30")), 1)
    except ValueError:
        return 30


def _confidence_min() -> float:
    try:
        return float(os.environ.get("MARKET_MAP_CONFIDENCE_MIN", "0.5"))
    except ValueError:
        return 0.5


@dataclass(frozen=True)
class PartResult:
    split_text: str
    node_id: str
    confidence: float


class MarketSplitMapService:
    def __init__(self) -> None:
        self._hierarchy = ReferenceHierarchy()
        self._client: Any | None = None
        self._flat_paths: list[str] = []
        self._cache: dict[tuple[str, str], list[PartResult]] = {}

    @property
    def is_loaded(self) -> bool:
        return self._hierarchy.is_loaded and bool(self._flat_paths)

    def load(self, path=None) -> None:
        self._hierarchy.load(path)
        self._flat_paths = self._build_flat_paths()

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None,
        normalized_by_item: list[str],
    ) -> list[MappedItem]:
        if not self.is_loaded:
            raise RuntimeError("Market split map service is not loaded")
        if not _is_truthy_env("MARKET_SPLIT_MAP_LLM_ENABLED", "true"):
            raise RuntimeError("MARKET_SPLIT_MAP_LLM_ENABLED=false")
        if not items:
            return []
        if len(items) != len(normalized_by_item):
            raise ValueError("normalized_by_item length must match items")

        source_key = _normalize_key(source_name or "")
        parts_by_index: list[tuple[list[PartResult], MatchSource]] = [None] * len(items)
        uncached: list[tuple[int, CategoryMapRequestItem, str, str]] = []

        for index, item in enumerate(items):
            normalized = normalized_by_item[index].strip() or item.raw_category
            normalized_key = _normalize_key(normalized)
            cached = self._cache.get((normalized_key, source_key))
            if cached is not None:
                parts_by_index[index] = (cached, "reference_cache")
                continue
            uncached.append((index, item, normalized, normalized_key))

        batch_size = _parse_batch_size()
        for offset in range(0, len(uncached), batch_size):
            batch = uncached[offset : offset + batch_size]
            try:
                raw_by_raw = self._classify_batch(batch, source_name)
            except Exception as exc:
                print(f"market split map: LLM batch failed ({len(batch)}): {exc}")
                raw_by_raw = {}
            for index, item, _normalized, normalized_key in batch:
                raw_parts = raw_by_raw.get(item.raw_category)
                resolved = self._resolve_parts(raw_parts)
                self._cache[(normalized_key, source_key)] = resolved
                parts_by_index[index] = (resolved, "reference_split_llm")

        results: list[MappedItem] = []
        for index, item in enumerate(items):
            parts, source = parts_by_index[index]
            normalized = normalized_by_item[index].strip() or item.raw_category
            for part in parts:
                results.append(
                    self._mapped_item(item, normalized, part, source)
                )
        return results

    def _resolve_parts(self, raw_parts: list[dict] | None) -> list[PartResult]:
        # Возвращает список частей; невалидные/низкоуверенные заменяются fallback-узлом.
        # Итоговый match_source решается в _mapped_item по node.id (fallback vs source).
        if not raw_parts:
            return [self._fallback_part("")]
        min_conf = _confidence_min()
        resolved: list[PartResult] = []
        for raw in raw_parts:
            part = self._to_part(raw)
            if (
                part is None
                or part.confidence < min_conf
                or self._hierarchy.get_node(part.node_id) is None
            ):
                split_text = raw.get("split_text", "") if isinstance(raw, dict) else ""
                resolved.append(self._fallback_part(str(split_text)))
            else:
                resolved.append(part)
        return resolved

    def _fallback_part(self, split_text: str) -> PartResult:
        return PartResult(
            split_text=split_text,
            node_id=self._hierarchy.fallback_node_id,
            confidence=0.0,
        )

    def _to_part(self, raw: Any) -> PartResult | None:
        if not isinstance(raw, dict):
            return None
        try:
            node_id = str(raw.get("node_id", "")).strip()
            split_text = str(raw.get("split_text", "")).strip()
            confidence = float(raw.get("confidence", 0.0))
        except (TypeError, ValueError):
            return None
        if not node_id:
            return None
        return PartResult(split_text=split_text, node_id=node_id, confidence=confidence)

    def _mapped_item(
        self,
        item: CategoryMapRequestItem,
        normalized: str,
        part: PartResult,
        source: MatchSource,
    ) -> MappedItem:
        node = self._hierarchy.get_node(part.node_id)
        if node is None:
            node = self._hierarchy.get_node(self._hierarchy.fallback_node_id)
        ancestors = self._hierarchy.ancestors_and_self(node.id)
        path = [ReferencePathNode(id=n.id, name=n.name) for n in ancestors]
        department = ancestors[0]
        category = ancestors[1] if len(ancestors) >= 2 else None
        is_department = len(ancestors) == 1
        return MappedItem(
            raw_category=item.raw_category,
            normalized_raw_category=normalized,
            split_text=part.split_text or node.name,
            display_label=node.name,
            reference_node_id=node.id,
            reference_department=department.name,
            reference_category=category.name if category else None,
            reference_subcategory=node.name if len(ancestors) >= 3 else None,
            reference_depth=node.level,
            reference_path=path,
            unified_category=node.name,
            unified_parent=department.name,
            unified_subcategory=category.name if category else None,
            rate=item.rate,
            confidence=part.confidence,
            is_bank_offer=False,
            is_macro_category=is_department,
            match_source="reference_fallback" if node.id == self._hierarchy.fallback_node_id else source,
        )

    def _build_flat_paths(self) -> list[str]:
        lines: list[str] = []
        for node in self._hierarchy.iter_nodes():
            path = " > ".join(node.path_names)
            hint = f" [{', '.join(node.examples)}]" if node.examples else ""
            lines.append(f"{node.id} | {path}{hint}")
        return lines

    def _get_client(self) -> "Mistral":
        if self._client is None:
            try:
                from mistralai.client import Mistral
            except ModuleNotFoundError as exc:
                raise RuntimeError("mistralai package is not installed") from exc
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                raise RuntimeError("MISTRAL_API_KEY is not configured")
            self._client = Mistral(api_key=api_key)
        return self._client

    def _classify_batch(
        self,
        batch: list[tuple[int, CategoryMapRequestItem, str, str]],
        source_name: str | None,
    ) -> dict[str, list[dict]]:
        item_lines = "\n".join(
            f"- raw: {json.dumps(item.raw_category, ensure_ascii=False)}, "
            f"normalized: {json.dumps(normalized, ensure_ascii=False)}"
            for _, item, normalized, _ in batch
        )
        prompt = PROMPT_TEMPLATE.format(
            source_name=source_name or "неизвестен",
            item_lines=item_lines,
            node_lines="\n".join(self._flat_paths),
        )
        response = self._get_client().chat.complete(
            model=os.environ.get("MISTRAL_CLASSIFIER_MODEL", "mistral-large-latest"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        data = self._parse_json(content)
        response_items = data.get("items")
        if not isinstance(response_items, list):
            return {}
        out: dict[str, list[dict]] = {}
        bucket: dict[str, deque[list[dict]]] = defaultdict(deque)
        for row in response_items:
            if not isinstance(row, dict):
                continue
            raw = str(row.get("raw", "")).strip()
            parts = row.get("parts")
            if not raw or not isinstance(parts, list):
                continue
            bucket[_normalize_key(raw)].append(parts)
        for _, item, _, _ in batch:
            key = _normalize_key(item.raw_category)
            if bucket.get(key):
                out[item.raw_category] = bucket[key].popleft()
        return out

    def _parse_json(self, content: str) -> dict:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = _JSON_FENCE_PREFIX_RE.sub("", cleaned)
            cleaned = _JSON_FENCE_SUFFIX_RE.sub("", cleaned)
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise ValueError("LLM response is not a JSON object")
        return data
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `cd backend && python -m pytest tests/test_market_split_map_service.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/services/market_split_map_service.py backend/tests/test_market_split_map_service.py
git commit -m "feat: MarketSplitMapService — LLM split+map 1:N with reference paths"
```

---

### Task 7: Подключить сервис в роутер и lifespan

**Files:**
- Modify: `backend/routers/category.py:1-61`
- Modify: `backend/main.py:11-79`

- [ ] **Step 1: Обновить роутер market-ветки**

В `backend/routers/category.py` заменить импорт и getter:

Заменить строку 6 `from services.reference_mapper_service import ReferenceMapperService` на:

```python
from services.market_split_map_service import MarketSplitMapService
```

Заменить функцию `_get_reference_mapper` (строки 20-24) на:

```python
def _get_market_mapper(request: Request) -> MarketSplitMapService:
    mapper: MarketSplitMapService | None = getattr(request.app.state, "market_mapper", None)
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Market category mapper is not ready")
    return mapper
```

В теле `category_map` заменить строку `mapper = _get_reference_mapper(request)` на `mapper = _get_market_mapper(request)`.

- [ ] **Step 2: Обновить lifespan и health в main.py**

В `backend/main.py` заменить строку 11 `from services.reference_mapper_service import ReferenceMapperService` на:

```python
from services.market_split_map_service import MarketSplitMapService
```

В `lifespan` заменить строки 41-47 на:

```python
    market_mapper = MarketSplitMapService()
    market_mapper.load()

    app.state.mapper = bank_mapper
    app.state.bank_mapper = bank_mapper
    app.state.market_mapper = market_mapper
    yield
```

В `health` заменить строку 71 на:

```python
    market_mapper: MarketSplitMapService | None = getattr(app.state, "market_mapper", None)
```

- [ ] **Step 3: Проверить запуск приложения (без LLM-вызова)**

Run:
```bash
cd backend && MISTRAL_API_KEY=dummy python -c "
import importlib, main
print('imports ok')
m = main
"
```
Expected: `imports ok` без ошибок импорта/синтаксиса.

- [ ] **Step 4: Smoke health через TestClient**

Run:
```bash
cd backend && python -c "
import os
os.environ.setdefault('MISTRAL_API_KEY','dummy')
from fastapi.testclient import TestClient
import main
with TestClient(main.app) as c:
    r = c.get('/health')
    print(r.json())
    assert r.json()['market_mapper_loaded'] is True
"
```
Expected: словарь со `'market_mapper_loaded': True`. (Требует установленный `sentence-transformers`; модель загрузится — может занять время.)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/category.py backend/main.py
git commit -m "feat: wire MarketSplitMapService into router and lifespan"
```

---

### Task 8: env.example и verify-скрипты

**Files:**
- Modify: `backend/env.example`
- Create: `scripts/verify_split_map_offline.py`
- Create: `scripts/verify_split_map.py`

- [ ] **Step 1: Обновить env.example**

В `backend/env.example` добавить (или обновить) строки:

```
MISTRAL_CLASSIFIER_MODEL=mistral-large-latest
MARKET_SPLIT_MAP_LLM_ENABLED=true
MARKET_MAP_BATCH_SIZE=30
MARKET_MAP_CONFIDENCE_MIN=0.5
REFERENCE_HIERARCHY_MD=
```

- [ ] **Step 2: Offline verify (без API)**

`scripts/verify_split_map_offline.py`:

```python
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from services.reference_hierarchy import ReferenceHierarchy  # noqa: E402


def main() -> int:
    h = ReferenceHierarchy()
    h.load()
    failures: list[str] = []

    # Узлы существуют и путь начинается с отдела.
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
```

- [ ] **Step 3: Live verify с выбором модели**

`scripts/verify_split_map.py`:

```python
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
```

- [ ] **Step 4: Запустить offline verify**

Run: `cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app && python scripts/verify_split_map_offline.py`
Expected: `OK: offline reference checks passed`

- [ ] **Step 5: Commit**

```bash
git add backend/env.example scripts/verify_split_map_offline.py scripts/verify_split_map.py
git commit -m "chore: env vars and verify scripts for market split map"
```

---

## Фаза C — Фронтенд (LCA-сравнение)

### Task 9: Тестовый каркас фронта (vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Установить vitest**

Run: `npm install -D vitest`
Expected: `vitest` появился в `devDependencies`.

- [ ] **Step 2: Конфиг vitest**

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
```

- [ ] **Step 3: Добавить npm-скрипт**

В `package.json` в раздел `scripts` добавить:

```json
"test": "vitest run"
```

- [ ] **Step 4: Проверить запуск**

Run: `npx vitest run`
Expected: `No test files found` — без ошибок конфига.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest scaffolding for frontend lib"
```

---

### Task 10: Чистый модуль LCA-сравнения

**Files:**
- Create: `lib/market-comparison.ts`
- Create: `lib/market-comparison.test.ts`

- [ ] **Step 1: Написать падающие тесты LCA**

`lib/market-comparison.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { buildMarketGroups, type ComparisonPart } from "@/lib/market-comparison"

function part(
  store: string,
  rate: number,
  label: string,
  pathNames: string[],
): ComparisonPart {
  const path = pathNames.map((name, i) => ({ id: `n${i}:${name}`, name }))
  return { store, rate, label, nodeId: path[path.length - 1].id, path }
}

describe("buildMarketGroups", () => {
  it("anchors at category when stores share it", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("magnit", 10, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
      part("lenta", 8, "Шампанское", ["Напитки", "Алкогольные напитки", "Шампанское"]),
    ]
    const groups = buildMarketGroups(parts)
    const napitki = groups.find((g) => g.parent === "Напитки")!
    const anchor = napitki.rows.find((r) => r.kind === "anchor")!
    expect(anchor.label).toBe("Алкогольные напитки")
  })

  it("anchors at department when stores diverge", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("lenta", 7, "Лимонад", ["Напитки", "Сладкие газированные напитки", "Лимонад"]),
    ]
    const groups = buildMarketGroups(parts)
    const anchor = groups[0].rows.find((r) => r.kind === "anchor")!
    expect(anchor.label).toBe("Напитки")
  })

  it("keeps item rows for every part", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("lenta", 7, "Лимонад", ["Напитки", "Сладкие газированные напитки", "Лимонад"]),
    ]
    const groups = buildMarketGroups(parts)
    const items = groups[0].rows.filter((r) => r.kind === "item").map((r) => r.label)
    expect(items.sort()).toEqual(["Лимонад", "Пиво"])
  })

  it("anchor rate shows min-max range per store", () => {
    const parts = [
      part("magnit", 5, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("magnit", 10, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
      part("lenta", 8, "Вино", ["Напитки", "Алкогольные напитки", "Вино"]),
    ]
    const groups = buildMarketGroups(parts)
    const anchor = groups[0].rows.find((r) => r.kind === "anchor")!
    expect(anchor.rateRanges.magnit).toEqual({ min: 5, max: 10 })
    expect(anchor.rateRanges.lenta).toEqual({ min: 8, max: 8 })
  })

  it("does not compare across departments", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("lenta", 7, "Хлеб", ["Хлеб и выпечка", "Хлеб", "Батон"]),
    ]
    const groups = buildMarketGroups(parts)
    expect(groups.map((g) => g.parent).sort()).toEqual([
      "Напитки",
      "Хлеб и выпечка",
    ])
  })

  it("no anchor when only one store in department", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("magnit", 5, "Вода", ["Напитки", "Вода", "Минеральная вода"]),
    ]
    const groups = buildMarketGroups(parts)
    const anchors = groups[0].rows.filter((r) => r.kind === "anchor")
    expect(anchors.length).toBe(0)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run lib/market-comparison.test.ts`
Expected: FAIL (модуль `@/lib/market-comparison` не найден).

- [ ] **Step 3: Реализовать модуль**

`lib/market-comparison.ts`:

```typescript
export interface RefPathNode {
  id: string
  name: string
}

export interface ComparisonPart {
  store: string
  rate: number
  label: string
  nodeId: string
  /** Путь от отдела (index 0) до узла (последний элемент). */
  path: RefPathNode[]
}

export interface RateRange {
  min: number
  max: number
}

export interface ComparisonAnchorRow {
  kind: "anchor"
  nodeId: string
  label: string
  rateRanges: Record<string, RateRange>
}

export interface ComparisonItemRow {
  kind: "item"
  nodeId: string
  label: string
  store: string
  rate: number
}

export type ComparisonRow = ComparisonAnchorRow | ComparisonItemRow

export interface ComparisonGroup {
  parent: string
  rows: ComparisonRow[]
}

function storesUnder(parts: ComparisonPart[]): Set<string> {
  return new Set(parts.map((p) => p.store))
}

/** Спуск: пока один ребёнок покрывает все магазины родителя — идём вниз. */
function findAnchorDepth(parts: ComparisonPart[]): number {
  const totalStores = storesUnder(parts)
  let depth = 0
  // depth — индекс узла в path, на котором стоит «якорь-кандидат».
  // Спускаемся, пока на следующем уровне один ребёнок покрывает все магазины.
  for (;;) {
    const byChild = new Map<string, ComparisonPart[]>()
    for (const part of parts) {
      const child = part.path[depth + 1]
      if (!child) {
        // Часть заканчивается на текущем уровне — глубже спускаться нельзя.
        return depth
      }
      const list = byChild.get(child.id) ?? []
      list.push(part)
      byChild.set(child.id, list)
    }
    let descended = false
    for (const childParts of byChild.values()) {
      if (storesUnder(childParts).size === totalStores.size && byChild.size === 1) {
        depth += 1
        descended = true
        break
      }
    }
    if (!descended) return depth
  }
}

function rangeFor(parts: ComparisonPart[]): Record<string, RateRange> {
  const ranges: Record<string, RateRange> = {}
  for (const part of parts) {
    const current = ranges[part.store]
    if (!current) {
      ranges[part.store] = { min: part.rate, max: part.rate }
    } else {
      current.min = Math.min(current.min, part.rate)
      current.max = Math.max(current.max, part.rate)
    }
  }
  return ranges
}

export function buildMarketGroups(parts: ComparisonPart[]): ComparisonGroup[] {
  const byDepartment = new Map<string, ComparisonPart[]>()
  for (const part of parts) {
    if (part.path.length === 0) continue
    const dept = part.path[0].name
    const list = byDepartment.get(dept) ?? []
    list.push(part)
    byDepartment.set(dept, list)
  }

  const groups: ComparisonGroup[] = []
  for (const [parent, deptParts] of byDepartment) {
    const rows: ComparisonRow[] = []
    const storeCount = storesUnder(deptParts).size

    if (storeCount >= 2) {
      const depth = findAnchorDepth(deptParts)
      const anchorNode = deptParts[0].path[depth]
      rows.push({
        kind: "anchor",
        nodeId: anchorNode.id,
        label: anchorNode.name,
        rateRanges: rangeFor(deptParts),
      })
    }

    for (const part of deptParts) {
      rows.push({
        kind: "item",
        nodeId: part.nodeId,
        label: part.label,
        store: part.store,
        rate: part.rate,
      })
    }
    groups.push({ parent, rows })
  }

  return groups.sort((a, b) => a.parent.localeCompare(b.parent, "ru"))
}
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run lib/market-comparison.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add lib/market-comparison.ts lib/market-comparison.test.ts
git commit -m "feat: market LCA comparison module (department cluster + coverage descent)"
```

---

### Task 11: Типы фронтенда

**Files:**
- Modify: `lib/types.ts:16-65`

- [ ] **Step 1: Расширить `MappedItem` и `MatrixRow`**

В `lib/types.ts` в интерфейс `MappedItem` (после `reference_depth?: number`, строка 32) добавить:

```typescript
  split_text?: string
  reference_path?: { id: string; name: string }[]
```

И в `match_source` union (строки 34-42) добавить `| "reference_split_llm"`.

В интерфейс `MatrixRow` (после `referenceDepth?: number`, строка 63) добавить:

```typescript
  /** "anchor" — строка сравнения (LCA); "item" — отдельный товар */
  rowKind?: "anchor" | "item"
  referencePath?: { id: string; name: string }[]
  /** Диапазон ставок по магазину для строки-якоря */
  rateRanges?: Record<string, { min: number; max: number }>
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без новых ошибок, связанных с `lib/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add split/path/range fields to frontend matrix types"
```

---

### Task 12: Интеграция LCA в матрицу

**Files:**
- Modify: `lib/matrix.ts:200-337` (market-ветка `mergeMappedItems`)
- Modify: `lib/matrix.ts:405-513` (`groupMatrixRows` market-ветка)

**Контекст:** Market-сравнение требует ВСЕ части всех магазинов сразу (LCA нельзя считать инкрементально по одному магазину). Поэтому для market накапливаем «сырые» части в матрице и строим группы один раз при отрисовке.

- [ ] **Step 1: Хранить части market в матрице**

В `lib/types.ts` в интерфейс `CashbackMatrix` (строки 74-78) добавить поле:

```typescript
  /** Сырые части market для LCA-группировки (только kind="market") */
  marketParts?: import("@/lib/market-comparison").ComparisonPart[]
```

- [ ] **Step 2: Накапливать части в `mergeMappedItems` (market)**

В `lib/matrix.ts` заменить market-ветку внутри `mergeMappedItems` (строки 221-273, блок `if (kind === "market") { ... continue }`) на накопление частей:

```typescript
    if (kind === "market") {
      const path = (item.reference_path ?? []).map((n) => ({ id: n.id, name: n.name }))
      if (path.length === 0) continue
      const acc = collectedMarketParts
      acc.push({
        store: provider.key,
        rate: item.rate,
        label: formatCategoryLabel(item.split_text ?? item.display_label ?? item.unified_category),
        nodeId: item.reference_node_id ?? path[path.length - 1].id,
        path,
      })
      continue
    }
```

В начале `mergeMappedItems` (после `const rowMap = new Map<string, MatrixRow>()`, строка 206) добавить:

```typescript
  const collectedMarketParts: import("@/lib/market-comparison").ComparisonPart[] =
    matrix && matrix.kind === kind ? [...(matrix.marketParts ?? [])] : []
```

В возвращаемом объекте (строки 330-337) добавить поле `marketParts`:

```typescript
  return {
    kind,
    providers,
    rows: Array.from(rowMap.values()).sort((a, b) =>
      a.category.localeCompare(b.category, "ru"),
    ),
    marketParts: kind === "market" ? collectedMarketParts : undefined,
  }
```

- [ ] **Step 2b: Импортировать модуль LCA в matrix.ts**

В начало `lib/matrix.ts` (после строки 11) добавить импорт:

```typescript
import { buildMarketGroups } from "@/lib/market-comparison"
```

- [ ] **Step 3: Строить группы из частей в `groupMatrixRows`**

Изменить сигнатуру `groupMatrixRows`, добавив опциональные части. Заменить строку 405 `export function groupMatrixRows(rows: MatrixRow[]): MatrixGroup[] {` на:

```typescript
export function groupMatrixRows(
  rows: MatrixRow[],
  marketParts?: import("@/lib/market-comparison").ComparisonPart[],
): MatrixGroup[] {
  if (marketParts && marketParts.length > 0) {
    return buildMarketGroupsAsMatrix(marketParts)
  }
```

(остальное тело без изменений).

Добавить новую функцию перед `groupMatrixRows`:

```typescript
function formatRange(range: { min: number; max: number }): number {
  // summaryRates ожидает число — используем максимум как репрезентативное значение.
  return range.max
}

function buildMarketGroupsAsMatrix(
  parts: import("@/lib/market-comparison").ComparisonPart[],
): MatrixGroup[] {
  const orderIndex = new Map(
    REFERENCE_HIERARCHY_DEPARTMENT_ORDER.map((name, index) => [
      normalizeCategoryLabel(name),
      index,
    ]),
  )
  const groups = buildMarketGroups(parts).map((group) => {
    const summaryRates: Record<string, number> = {}
    const rows: MatrixRow[] = []
    for (const row of group.rows) {
      if (row.kind === "anchor") {
        const rates: Record<string, number> = {}
        for (const [store, range] of Object.entries(row.rateRanges)) {
          rates[store] = formatRange(range)
          summaryRates[store] = Math.max(summaryRates[store] ?? 0, range.max)
        }
        rows.push({
          category: formatCategoryLabel(row.label),
          parent: group.parent,
          rowKind: "anchor",
          referenceDepartment: group.parent,
          referenceNodeId: row.nodeId,
          rateRanges: row.rateRanges,
          rates,
        })
      } else {
        summaryRates[row.store] = Math.max(summaryRates[row.store] ?? 0, row.rate)
        rows.push({
          category: formatCategoryLabel(row.label),
          parent: group.parent,
          rowKind: "item",
          referenceDepartment: group.parent,
          referenceNodeId: row.nodeId,
          rates: { [row.store]: row.rate },
        })
      }
    }
    return {
      parent: group.parent,
      summaryRates,
      rows,
      isMacroOnly: rows.every((r) => r.rowKind === "anchor"),
    } satisfies MatrixGroup
  })
  return groups.sort((a, b) => {
    const aOrder = orderIndex.get(normalizeCategoryLabel(a.parent)) ?? Number.MAX_SAFE_INTEGER
    const bOrder = orderIndex.get(normalizeCategoryLabel(b.parent)) ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.parent.localeCompare(b.parent, "ru")
  })
}
```

- [ ] **Step 4: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без новых ошибок в `lib/matrix.ts`. (Старые market-хелперы `resolveMarketComparisonAnchor` и т.п. могут остаться неиспользуемыми — удаляются в Task 14.)

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/matrix.ts
git commit -m "feat: build market matrix groups via LCA comparison module"
```

---

### Task 13: Передать `marketParts` в `groupMatrixRows` на экране результатов

**Files:**
- Modify: `components/screens/results-screen.tsx`

- [ ] **Step 1: Найти вызовы `groupMatrixRows`**

Run: `rg -n "groupMatrixRows" components/`
Expected: одна или несколько строк вызова в `results-screen.tsx`.

- [ ] **Step 2: Передавать `marketParts` для market-матрицы**

В `components/screens/results-screen.tsx` в каждом вызове `groupMatrixRows(matrix.rows)` для market-матрицы передать второй аргумент. Пример замены:

```typescript
const groups = groupMatrixRows(matrix.rows, matrix.marketParts)
```

(Для bank-матрицы `matrix.marketParts` будет `undefined` — ветка LCA не активируется.)

- [ ] **Step 3: Отрисовать диапазон для строк-якорей**

Найти, где рендерится ставка строки (там, где используется `row.rates[provider.key]`). Добавить отображение диапазона, когда есть `row.rateRanges`. Пример: рядом с местом, где выводится ставка ячейки, использовать хелпер:

```typescript
function cellLabel(row: MatrixRow, providerKey: string): string {
  const range = row.rateRanges?.[providerKey]
  if (range) {
    return range.min === range.max ? `${range.max}%` : `${range.min}–${range.max}%`
  }
  const rate = row.rates[providerKey]
  return rate === undefined ? "—" : `${rate}%`
}
```

Заменить вывод ставки ячейки на `cellLabel(row, provider.key)`.

- [ ] **Step 4: Проверить сборку**

Run: `npm run build`
Expected: сборка успешна (`Compiled successfully`).

- [ ] **Step 5: Commit**

```bash
git add components/screens/results-screen.tsx
git commit -m "feat: render LCA anchor rows with rate ranges on results screen"
```

---

### Task 14: Регенерировать порядок отделов и убрать legacy market-логику

**Files:**
- Modify: `lib/reference-hierarchy-order.ts`
- Modify: `lib/matrix.ts` (удалить неиспользуемые market-хелперы)

- [ ] **Step 1: Сгенерировать актуальный порядок отделов**

Run:
```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app && \
python -c "
import json
d=json.load(open('backend/data/reference_hierarchy.json'))
names=[x['name'] for x in d['departments'] if x['id']!='d99']
print('export const REFERENCE_HIERARCHY_DEPARTMENT_ORDER = [')
for n in names: print(f'  {json.dumps(n, ensure_ascii=False)},')
print('] as const')
"
```
Скопировать вывод в `lib/reference-hierarchy-order.ts` (полностью заменив файл).

- [ ] **Step 2: Удалить неиспользуемые market-хелперы**

В `lib/matrix.ts` удалить ставшие неиспользуемыми функции market-ветки: `getReferenceDepth`, `parseReferenceNodeId`, `resolveMarketComparisonAnchor`, `marketRowKeyFromAnchor`, `resolveMarketRowKey`, `marketRowKeyFromExisting`, и тип `MarketComparisonAnchor` (строки 78-164). В `rowKeyFromExisting` (строки 53-62) убрать ветку `if (kind === "market" && ...)` (market теперь не использует rowMap).

Заменить `rowKeyFromExisting` на:

```typescript
function rowKeyFromExisting(row: MatrixRow): string {
  if (row.isMacro && row.parent) {
    return `macro::${normalizeCategoryLabel(row.parent)}`
  }
  const canonical = row.canonicalCategory ?? row.category
  return `leaf::${normalizeCategoryLabel(canonical)}`
}
```

И обновить её единственный вызов в `mergeMappedItems` (строка 210) на `rowKeyFromExisting(row)` (убрать аргумент `kind`).

- [ ] **Step 3: Проверить типы и линт**

Run: `npx tsc --noEmit && npm run lint`
Expected: нет ошибок «unused» и типов.

- [ ] **Step 4: Запустить все фронт-тесты**

Run: `npx vitest run`
Expected: PASS (все тесты `lib/`).

- [ ] **Step 5: Commit**

```bash
git add lib/reference-hierarchy-order.ts lib/matrix.ts
git commit -m "refactor: regenerate department order, remove legacy market mapping helpers"
```

---

### Task 15: Удалить старый бэкенд-сервис и depth-логику

**Files:**
- Delete: `backend/services/reference_mapper_service.py`
- Modify: `backend/services/reference_hierarchy.py` (`resolve_display_node` уже отсутствует после Task 4 — проверить)

- [ ] **Step 1: Убедиться, что старый сервис больше нигде не импортируется**

Run: `rg -n "reference_mapper_service|resolve_display_node|ReferenceMapperService" backend/`
Expected: совпадений нет (после Tasks 4, 7). Если есть — поправить импорт на `MarketSplitMapService`.

- [ ] **Step 2: Удалить файл старого сервиса**

```bash
git rm backend/services/reference_mapper_service.py
```

- [ ] **Step 3: Прогнать все backend-тесты**

Run: `cd backend && python -m pytest -v`
Expected: PASS (все тесты Tasks 2, 4, 6).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy ReferenceMapperService and depth resolution"
```

---

## Финальная проверка

- [ ] **Backend offline + unit**

Run: `cd backend && python -m pytest -v && cd .. && python scripts/verify_split_map_offline.py`
Expected: все тесты PASS; offline verify `OK`.

- [ ] **Frontend**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: тесты PASS, типы чистые, сборка успешна.

- [ ] **Live (опционально, требует `MISTRAL_API_KEY`)**

Run: `MISTRAL_API_KEY=... python scripts/verify_split_map.py`
Expected: таблица small/medium/large по кейсам; зафиксировать дефолт модели в `backend/env.example`, если large не лучший.

---

## Карта файлов

**Создаются:**
- `scripts/build_reference_hierarchy.py`, `scripts/__init__.py`, `scripts/verify_split_map.py`, `scripts/verify_split_map_offline.py`
- `backend/services/market_split_map_service.py`
- `backend/pytest.ini`, `backend/tests/` (conftest, fixtures, test_*)
- `lib/market-comparison.ts` (+ `.test.ts`)
- `vitest.config.ts`

**Изменяются:**
- `backend/data/reference_hierarchy.json` (перегенерация)
- `backend/services/reference_hierarchy.py` (дерево переменной глубины)
- `backend/schemas.py`, `backend/routers/category.py`, `backend/main.py`, `backend/env.example`, `backend/requirements.txt`
- `lib/types.ts`, `lib/matrix.ts`, `lib/reference-hierarchy-order.ts`
- `components/screens/results-screen.tsx`
- `package.json`

**Удаляются:**
- `backend/services/reference_mapper_service.py`
