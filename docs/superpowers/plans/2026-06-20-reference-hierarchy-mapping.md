# Reference Hierarchy Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить market-маппинг на эталонную иерархию продуктов + LLM-сопоставление; матрица группируется по отделам эталона с каноническими названиями.

**Architecture:** `CategoryNormalizer` → `ReferenceMapperService` (Mistral batch, closed `node_id` list) → `MappedItem.reference_*` → `lib/matrix.ts` группировка по `reference_department`. Банковский `MapperService` без изменений.

**Tech Stack:** FastAPI, Mistral API, JSON hierarchy, verify scripts (нет pytest в проекте).

**Spec:** `docs/superpowers/specs/2026-06-20-reference-hierarchy-mapping-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `scripts/build_reference_hierarchy.py` | Парсит `.md` → `reference_hierarchy.json` |
| `backend/data/reference_hierarchy.json` | 12 отделов, L2/L3, fallback `d99` |
| `backend/services/reference_hierarchy.py` | Load tree, `nodes_by_id`, `_resolve_display_node` |
| `backend/services/reference_mapper_service.py` | LLM batch classify, cache, `map_items` |
| `backend/schemas.py` | `reference_*`, `display_label`, match_source |
| `backend/routers/category.py` | market → normalizer → ReferenceMapper |
| `backend/main.py` | lifespan: убрать market SentenceTransformer, load ReferenceMapper |
| `lib/reference-hierarchy-order.ts` | Порядок отделов для сортировки групп |
| `lib/types.ts` | `referenceNodeId`, `referenceDepartment`, `referenceDepth`, `displayLabel` |
| `lib/matrix.ts` | Ключ `ref::`, группировка по department, убрать market canonical split |
| `scripts/verify_reference_mapper_offline.py` | depth resolve без API |
| `scripts/verify_reference_mapper.py` | LLM cases (live, `MISTRAL_API_KEY`) |

**Удалить после переключения:** `market_mapper_service.py`, старые market JSON, `verify_market_catalog.py`.

---

### Task 1: Build reference hierarchy JSON

**Files:**
- Create: `scripts/build_reference_hierarchy.py`
- Create: `backend/data/reference_hierarchy.json` (generated)

- [x] **Step 1: Скрипт парсинга**

```python
# scripts/build_reference_hierarchy.py — ключевая логика
def parse_tree_block(lines: list[str]) -> list[dict]: ...
def assign_ids(departments: list[dict]) -> dict: ...
# id: d01..d12, d01.c01, d01.c01.s01
# + synthetic d99 «Прочее» > d99.c01 «Прочее»
```

Вход по умолчанию:
`REFERENCE_HIERARCHY_MD` или `/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/Эталонная иерархия категорий продуктов питания.md`

- [x] **Step 2: Сгенерировать JSON**

```bash
REFERENCE_HIERARCHY_MD="/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/Эталонная иерархия категорий продуктов питания.md" \
  backend/.venv/bin/python scripts/build_reference_hierarchy.py
```

Expected: `backend/data/reference_hierarchy.json` с 12 departments + d99 fallback.

- [x] **Step 3: Проверка**

```bash
backend/.venv/bin/python scripts/build_reference_hierarchy.py --check
```

Expected: `OK: N departments, M nodes, ids unique`

- [x] **Step 4: Ручная правка** — сверить 3 узла: `Кисломолочные продукты`, `Макаронные изделия`, `Алкогольные напитки` присутствуют с ожидаемыми id.

---

### Task 2: Reference hierarchy loader + depth resolver (offline)

**Files:**
- Create: `backend/services/reference_hierarchy.py`
- Create: `scripts/verify_reference_mapper_offline.py`

- [x] **Step 1: Dataclasses и load**

```python
@dataclass(frozen=True)
class ReferenceNode:
    id: str
    name: str
    level: Literal[1, 2, 3]
    department_id: str
    category_id: str | None
    path: tuple[str, ...]

class ReferenceHierarchy:
    def load(self, path: Path) -> None: ...
    def get_node(self, node_id: str) -> ReferenceNode | None: ...
    def department_order(self) -> list[str]: ...
```

- [x] **Step 2: `_resolve_display_node(node_id, depth)`**

```python
def resolve_display_node(hierarchy: ReferenceHierarchy, node_id: str, depth: int) -> ReferenceNode:
    node = hierarchy.get_node(node_id)
    if depth == 1:
        return hierarchy.get_node(node.department_id)
    if depth == 2 and node.level == 3:
        return hierarchy.get_node(node.category_id)
    return node
```

- [x] **Step 3: Offline verify script**

```python
# scripts/verify_reference_mapper_offline.py
CASES = [
    ("d04.c02", 2, "Кисломолочные продукты", "d04"),
    ("d04.c02.s01", 3, "Йогурты", "d04"),
    ("d04.c02.s01", 2, "Кисломолочные продукты", "d04"),  # lift L3→L2
]
```

- [x] **Step 4: Run**

```bash
backend/.venv/bin/python scripts/verify_reference_mapper_offline.py
```

Expected: `All checks passed`

---

### Task 3: ReferenceMapperService (LLM)

**Files:**
- Create: `backend/services/reference_mapper_service.py`
- Create: `scripts/verify_reference_mapper.py`

- [x] **Step 1: Batch prompt + parse** (паттерн из `category_classifier_service.py`)

```python
REFERENCE_MAP_PROMPT = """Ты классификатор категорий кэшбэка супермаркетов.
...
Верни ТОЛЬКО JSON: {{"items":[{{"raw":"...","node_id":"...","depth":2,"confidence":0.95}}]}}
"""

class ReferenceMapperService:
    def __init__(self) -> None:
        self._hierarchy = ReferenceHierarchy()
        self._cache: dict[tuple[str, str], ClassifyResult] = {}

    def load(self) -> None:
        self._hierarchy.load(REFERENCE_HIERARCHY_PATH)

    def map_items(
        self,
        items: list[CategoryMapRequestItem],
        source_name: str | None,
        normalized_by_item: list[str],
    ) -> list[MappedItem]: ...
```

- [x] **Step 2: Заполнение MappedItem** (legacy + reference поля)

```python
mapped = MappedItem(
    raw_category=item.raw_category,
    normalized_raw_category=norm,
    display_label=display_node.name,
    reference_node_id=display_node.id,
    reference_department=dept_node.name,
    reference_category=cat_node.name if depth >= 2 else None,
    reference_subcategory=sub_node.name if depth == 3 else None,
    reference_depth=depth,
    unified_category=display_node.name,
    unified_parent=dept_node.name,
    unified_subcategory=cat_node.name if depth >= 2 else None,
    is_macro_category=(depth == 1),
    confidence=confidence,
    match_source="reference_llm",
)
```

- [x] **Step 3: Live verify** (8 кейсов из спеки, `source_name="Магнит"`)

```bash
cd backend && set -a && source .env && set +a
cd .. && backend/.venv/bin/python scripts/verify_reference_mapper.py
```

Expected: ≥7/8 pass (LLM может ошибиться на 1 edge; зафиксировать в промпте).

- [x] **Step 4: In-memory cache** — повторный вызов с тем же `(normalized, source)` не дергает API (assert в verify).

---

### Task 4: Wire backend

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/routers/category.py`
- Modify: `backend/main.py`
- Delete: `backend/services/market_mapper_service.py` (после wire)

- [x] **Step 1: schemas** — добавить поля `reference_*`, `display_label`; расширить `match_source`:

```python
match_source: Literal[..., "reference_llm", "reference_cache", "reference_fallback"] | None
reference_node_id: str | None = None
reference_department: str | None = None
reference_category: str | None = None
reference_subcategory: str | None = None
reference_depth: Literal[1, 2, 3] | None = None
display_label: str | None = None
```

- [x] **Step 2: category router**

```python
if body.kind == "market":
    normalizer = _get_category_normalizer(request)
    mapper = _get_reference_mapper(request)
    norm_results = [normalizer.normalize(i.raw_category) for i in body.items]
    items = mapper.map_items(
        body.items,
        body.source_name,
        [r.normalized for r in norm_results],
    )
```

- [x] **Step 3: main.py lifespan**

```python
reference_mapper = ReferenceMapperService()
reference_mapper.load()
# Убрать MarketMapperService + не грузить SentenceTransformer только для market
app.state.reference_mapper = reference_mapper
app.state.market_mapper = reference_mapper  # alias для health backward compat
```

Банк по-прежнему грузит `SentenceTransformer`.

- [x] **Step 4: Health + smoke**

```bash
curl -s http://localhost:8000/health
curl -s -X POST http://localhost:8000/api/category/map \
  -H 'Content-Type: application/json' \
  -d '{"kind":"market","source_name":"Магнит","items":[{"raw_category":"Кисломолочка","rate":10}]}'
```

Expected: `reference_department` = «Молочные продукты и яйца», `display_label` = «Кисломолочные продукты».

---

### Task 5: Frontend matrix (variant C)

**Files:**
- Create: `lib/reference-hierarchy-order.ts`
- Modify: `lib/types.ts`
- Modify: `lib/matrix.ts`

- [x] **Step 1: types**

```typescript
export interface MappedItem {
  // ...existing
  reference_node_id?: string
  reference_department?: string
  reference_category?: string
  reference_subcategory?: string
  reference_depth?: 1 | 2 | 3
  display_label?: string
  match_source?: string
}

export interface MatrixRow {
  category: string
  referenceNodeId?: string
  referenceDepartment?: string
  referenceDepth?: 1 | 2 | 3
  parent?: string
  isMacro?: boolean
  rates: Record<string, number>
  // remove canonicalCategory for market path
}
```

- [x] **Step 2: `reference-hierarchy-order.ts`** — массив 12 отделов в порядке эталона для `sortGroups`.

- [x] **Step 3: `lib/matrix.ts`**

```typescript
function resolveMarketRowKey(item: MappedItem): string {
  const id = item.reference_node_id ?? item.unified_category
  const depth = item.reference_depth ?? 2
  return `ref::${id}::${depth}`
}

function resolveMarketDisplayLabel(item: MappedItem): string {
  return item.display_label ?? item.unified_category
}

// groupMatrixRows: parent = reference_department (depth 1 rows → isMacro on group)
// children: reference_depth >= 2
```

- [x] **Step 4: Build**

```bash
npm run build
```

Expected: no TypeScript errors.

---

### Task 6: Cleanup + docs

**Files:**
- Move to `backend/data/archive/` or delete: `market_category_catalog.json`, `market_cashback_consensus.json`, `supermarket_*.json`
- Delete: `scripts/verify_market_catalog.py`, `scripts/apply_market_cashback_consensus.py`
- Modify: `backend/env.example` — `REFERENCE_MAP_*` vars
- Modify: `docs/superpowers/specs/2026-06-18-*.md` — note superseded for market

- [x] **Step 1:** Архивировать неиспользуемые JSON (не коммитить логи scrape).
- [x] **Step 2:** Удалить `market_mapper_service.py`, почистить imports.
- [x] **Step 3:** `graphify update .`
- [x] **Step 4:** E2E — скриншот Магнит+Пятёрочка: «Кисломолочка» → «Кисломолочные продукты» под «Молочные продукты и яйца».

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| reference_hierarchy.json from .md | Task 1 |
| ReferenceMapperService LLM batch | Task 3 |
| Flexible depth resolve | Task 2 |
| CategoryNormalizer before mapper | Task 4 (existing) |
| MappedItem reference_* fields | Task 4 |
| Matrix variant C grouping | Task 5 |
| Verify scripts | Tasks 2, 3 |
| Remove old market mapper/data | Task 6 |
| Bank unchanged | Tasks 4–5 touch market only |
| Env vars | Task 6 |

## Execution order

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6
```

Tasks 1–2 можно параллелить после Step 1 Task 1 (нужен JSON).
