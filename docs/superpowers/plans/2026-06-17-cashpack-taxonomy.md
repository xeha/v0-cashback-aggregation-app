# CashPack Taxonomy + Hierarchical Matrix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat `taxonomy.json` with CashPack 2-level hierarchy (26 parents / 108 subcategories), fix bank catalog mapping to CashPack leaves, and show results matrix as accordion (parent summary + expandable subcategories).

**Architecture:** Generate `category_hierarchy.json` from parsed CashPack JSON; sync `bank_category_catalog.json` with `unified_subcategory` + `unified_parent`; `MapperService` embeds against 108 leaves and resolves parent via lookup; frontend groups matrix rows by parent with max-rate summary and optional flat toggle.

**Tech Stack:** FastAPI, Pydantic v2, sentence-transformers, Next.js 16, TypeScript, Framer Motion

**Spec:** [2026-06-17-cashpack-taxonomy-design.md](../specs/2026-06-17-cashpack-taxonomy-design.md)

**Prerequisite:** Branch with `bank_category_catalog.json`, `bank_aliases.json`, `sync_bank_catalog.py` already present (bank-catalog spec).

---

## File map

| File | Responsibility |
|------|----------------|
| `scripts/sync_category_hierarchy.py` | `categories.json` → `category_hierarchy.json` |
| `backend/data/category_hierarchy.json` | Runtime tree + `subcategory_to_parent` lookup |
| `backend/data/taxonomy_migration.json` | Old flat unified → CashPack leaf (manual) |
| `scripts/sync_bank_catalog.py` | Rebuild catalog targeting CashPack leaves |
| `backend/data/bank_category_catalog.json` | Per-bank keys → subcategory + parent |
| `backend/services/mapper_service.py` | Hierarchy-aware mapping |
| `backend/schemas.py` | Extended `MappedItem` fields |
| `scripts/verify_bank_catalog.py` | Regression cases incl. parent/subcategory |
| `lib/types.ts` | `unified_parent`, `MatrixRow.parent`, `MatrixGroup` |
| `lib/matrix.ts` | `groupMatrixRows`, extended `mergeMappedItems` |
| `components/screens/results-screen.tsx` | Accordion + flat toggle |
| `lib/api.ts` | Pass through new fields (no breaking change) |

---

### Task 1: Generate category hierarchy from CashPack JSON

**Files:**
- Create: `scripts/sync_category_hierarchy.py`
- Create: `backend/data/category_hierarchy.json` (generated)

- [ ] **Step 1: Create sync script**

```python
#!/usr/bin/env python3
"""Generate backend/data/category_hierarchy.json from CashPack categories.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT.parent / "parsing_cat_subcat_hierarchy" / "categories.json"
OUTPUT_PATH = REPO_ROOT / "backend" / "data" / "category_hierarchy.json"


def normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def build_hierarchy(source: dict) -> dict:
    parents = []
    subcategory_to_parent: dict[str, str] = {}
    subcategory_names: list[str] = []

    for cat in source.get("categories", []):
        parent_name = cat["name"]
        subs = [
            {"id": s["id"], "name": s["name"]}
            for s in cat.get("subcategories", [])
        ]
        parents.append({"id": cat["id"], "name": parent_name, "subcategories": subs})
        for sub in subs:
            subcategory_to_parent[normalize(sub["name"])] = parent_name
            subcategory_names.append(sub["name"])

    return {
        "source": source.get("source", "https://cashpack.ru/offers/"),
        "parsed_at": source.get("parsed_at"),
        "total_parents": len(parents),
        "total_subcategories": len(subcategory_names),
        "parents": parents,
        "subcategory_names": sorted(subcategory_names, key=str.lower),
        "subcategory_to_parent": dict(sorted(subcategory_to_parent.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", default=str(DEFAULT_SOURCE))
    args = parser.parse_args()
    source_path = Path(args.source)
    if not source_path.is_file():
        print(f"ERROR: not found: {source_path}", file=sys.stderr)
        return 1
    raw = json.loads(source_path.read_text(encoding="utf-8"))
    out = build_hierarchy(raw)
    OUTPUT_PATH.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH} ({out['total_subcategories']} subcategories)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run generator**

```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app
python3 scripts/sync_category_hierarchy.py
```

Expected: `Wrote backend/data/category_hierarchy.json (108 subcategories)`

- [ ] **Step 3: Spot-check output**

```bash
python3 -c "
import json
h = json.load(open('backend/data/category_hierarchy.json'))
assert h['total_subcategories'] == 108
assert h['subcategory_to_parent']['доставка продуктов'] == 'Продукты И Напитки'
print('OK')
"
```

---

### Task 2: Taxonomy migration table (flat → CashPack leaf)

**Files:**
- Create: `backend/data/taxonomy_migration.json`

- [ ] **Step 1: Create migration file**

Map each string from current `taxonomy.json` to a CashPack **subcategory** name (exact display string from hierarchy). App-only categories not in CashPack get synthetic entries in overrides instead.

```json
{
  "кафе, бары, рестораны": "Рестораны",
  "фастфуд": "Фастфуд",
  "супермаркеты": "Супермаркеты",
  "продукты питания": "Продукты питания",
  "доставка продуктов": "Доставка продуктов",
  "все покупки": "Прочее (УСЛУГИ)",
  "аптеки": "Аптеки",
  "красота и уход": "Товары для ухода за собой",
  "одежда и обувь": "Женская одежда",
  "товары для детей": "Товары для детей",
  "транспорт и такси": "Такси",
  "азс и топливо": "Топливо",
  "развлечения": "Прочее (ДОСУГ и ОТДЫХ)",
  "путешествия": "Отели",
  "онлайн-покупки": "Маркетплейсы",
  "покупки в приложении банка": "Прочее (ОНЛАЙН СЕРВИСЫ И ИГРЫ)",
  "маркетплейсы": "Маркетплейсы",
  "электроника": "Электроника",
  "дом и ремонт": "Товары для дома",
  "мебель": "Мебель",
  "животные и зоотовары": "Корм",
  "книги и канцтовары": "Книги",
  "спорт и фитнес": "Товары для спорта",
  "образование": "Прочее (ОБУЧЕНИЕ)",
  "медицина": "Прочее (МЕДИЦИНА)",
  "страхование": "Страхование",
  "коммунальные услуги": "Коммунальные услуги",
  "молочные продукты": "Продукты питания",
  "мясо и птица": "Продукты питания",
  "алкоголь": "Алкоголь",
  "готовая еда": "Доставка готовой еды",
  "прочее": "Прочее (УСЛУГИ)"
}
```

Keys are normalized lowercase (same as `normalize()` in scripts).

- [ ] **Step 2: Extend `bank_category_unified_overrides.json`** for bank ecosystems (keep existing entries; ensure values are CashPack leaf names):

```json
{
  "яндекс лавка": "Доставка продуктов",
  "самокат": "Доставка продуктов",
  "активный отдых": "Товары для спорта",
  "сберздоровье": "Прочее (МЕДИЦИНА)",
  "яндекс плюс": "Подписки",
  "детский мир": "Товары для детей",
  "альфа-афиша": "Кинотеатры, театры, выставки",
  "на ж/д в тревел": "Жд билеты",
  "мкб travel": "Отели",
  "тревел": "Отели"
}
```

Merge with existing file; do not delete current keys.

---

### Task 3: Rebuild bank catalog for CashPack leaves

**Files:**
- Modify: `scripts/sync_bank_catalog.py`
- Regenerate: `backend/data/bank_category_catalog.json`

- [ ] **Step 1: Replace taxonomy dependency with hierarchy**

In `sync_bank_catalog.py`:

- Import `HIERARCHY_PATH = REPO_ROOT / "backend" / "data" / "category_hierarchy.json"`
- Import `MIGRATION_PATH = REPO_ROOT / "backend" / "data" / "taxonomy_migration.json"`
- Load `subcategory_names` as `set` and `subcategory_to_parent` dict
- Replace `resolve_unified()` with:

```python
def resolve_cashpack_leaf(
    raw: str,
    bank_category: str,
    leaves: set[str],
    leaf_to_parent: dict[str, str],
    overrides: dict[str, str],
    migration: dict[str, str],
) -> tuple[str | None, str | None]:
    """Return (unified_subcategory, unified_parent)."""
    for candidate in (raw, bank_category):
        key = normalize(candidate)
        if key in overrides:
            leaf = overrides[key]
            return leaf, leaf_to_parent.get(normalize(leaf))
        if candidate in leaves:
            return candidate, leaf_to_parent.get(normalize(candidate))
        if key in leaf_to_parent:
            # raw is already a CashPack subcategory name (normalized key)
            parent = leaf_to_parent[key]
            # find display-case leaf name
            for leaf in leaves:
                if normalize(leaf) == key:
                    return leaf, parent
        if key in migration:
            leaf = migration[key]
            return leaf, leaf_to_parent.get(normalize(leaf))
    return None, None
```

- [ ] **Step 2: Change catalog entry shape**

```python
catalog.setdefault(slug, {})[raw] = {
    "bank_category": bank_category,
    "unified_subcategory": sub,
    "unified_parent": parent,
    "unified": sub,  # backward compat for mapper until Task 4
    "match_level": match_level,
}
```

- [ ] **Step 3: Regenerate catalog**

```bash
python3 scripts/sync_category_hierarchy.py
python3 scripts/sync_bank_catalog.py
```

- [ ] **Step 4: Verify no travel→supermarket bugs**

```bash
python3 -c "
import json
c = json.load(open('backend/data/bank_category_catalog.json'))
bad = [(s,k,v) for s,entries in c.items() for k,v in entries.items()
       if k in ('авиа билеты','отели','жд билеты') and v.get('unified_subcategory') == 'Супермаркеты']
assert not bad, bad[:3]
print('No travel→supermarket regressions')
"
```

Expected: `No travel→supermarket regressions`

---

### Task 4: MapperService — hierarchy + parent fields

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/services/mapper_service.py`

- [ ] **Step 1: Extend schema**

```python
class MappedItem(BaseModel):
    raw_category: str
    unified_category: str
    unified_subcategory: str | None = None
    unified_parent: str | None = None
    rate: float
    confidence: float
    is_bank_offer: bool = False
    match_source: Literal["catalog", "override", "embedding", "fallback"] | None = None
```

- [ ] **Step 2: Update mapper constants**

```python
HIERARCHY_PATH = Path(__file__).resolve().parent.parent / "data" / "category_hierarchy.json"
FALLBACK_SUBCATEGORY = "Прочее (УСЛУГИ)"
FALLBACK_PARENT = "Услуги"
```

Remove `TAXONOMY_PATH` usage.

- [ ] **Step 3: Load hierarchy in `load()`**

```python
def load(self) -> None:
    hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
    self._subcategories: list[str] = hierarchy["subcategory_names"]
    self._subcategory_to_parent: dict[str, str] = hierarchy["subcategory_to_parent"]
    # ... overrides, catalog, aliases unchanged ...
    self._subcategory_embeddings = self._model.encode(
        self._subcategories,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
```

Rename `_taxonomy` → `_subcategories`, `_taxonomy_embeddings` → `_subcategory_embeddings`.

- [ ] **Step 4: Add helper**

```python
def _resolve_parent(self, subcategory: str) -> str:
    return self._subcategory_to_parent.get(
        _normalize_category_name(subcategory),
        FALLBACK_PARENT,
    )

def _mapped_item(
    self,
    item: CategoryMapRequestItem,
    subcategory: str,
    confidence: float,
    bank_slug: str | None,
    normalized: str,
    match_source: str,
) -> MappedItem:
    parent = self._resolve_parent(subcategory)
    return MappedItem(
        raw_category=item.raw_category,
        unified_category=subcategory,
        unified_subcategory=subcategory,
        unified_parent=parent,
        rate=item.rate,
        confidence=confidence,
        is_bank_offer=_is_bank_offer(bank_slug, normalized, self._bank_offer_keys),
        match_source=match_source,
    )
```

- [ ] **Step 5: Catalog branch — prefer new fields, fallback `unified`**

```python
if bank_slug:
    entry = self._catalog.get(bank_slug, {}).get(normalized)
    sub = (entry.get("unified_subcategory") or entry.get("unified")) if entry else None
    if sub:
        mapped.append(self._mapped_item(item, sub, CONFIDENCE_OVERRIDE, bank_slug, normalized, "catalog"))
        continue
```

- [ ] **Step 6: Override branch — resolve parent from subcategory**

```python
override = self._overrides.get(normalized)
if override:
    mapped.append(self._mapped_item(item, override, CONFIDENCE_OVERRIDE, bank_slug, normalized, "override"))
    continue
```

Ensure `category_overrides.json` values are CashPack leaf names (update `активный отдых` → `Товары для спорта` if still `Развлечения`).

- [ ] **Step 7: Embedding branch**

```python
similarities = np.dot(self._subcategory_embeddings, query_embedding)
best_idx = int(np.argmax(similarities))
confidence = float(similarities[best_idx])
sub = (
    self._subcategories[best_idx]
    if confidence >= self._threshold
    else FALLBACK_SUBCATEGORY
)
mapped.append(self._mapped_item(item, sub, round(confidence, 4), bank_slug, normalized,
    "embedding" if confidence >= self._threshold else "fallback"))
```

- [ ] **Step 8: Run verify script (will fail until Task 3 data + case updates)**

```bash
cd backend && python3 ../scripts/verify_bank_catalog.py
```

Fix failures before proceeding.

---

### Task 5: Update verify script for CashPack expectations

**Files:**
- Modify: `scripts/verify_bank_catalog.py`

- [ ] **Step 1: Extend CASES tuple** — each case: `(source, raw, expected_sub, expected_conf, is_bank_offer?, expected_parent?)`

```python
CASES = [
    ("Сбер", "Аптеки", "Аптеки", 1.0, False, "Медицина И Здоровье"),
    ("Яндекс Банк", "Яндекс Лавка", "Доставка продуктов", 1.0, True, "Продукты И Напитки"),
    ("Альфа-Банк", "Активный отдых", "Товары для спорта", 1.0, False, "Спорт И Активный Отдых"),
    ("ОТП Банк", "АЗС", "Топливо", 1.0, False, "Авто"),
    ("ОТП Банк", "Женская одежда", "Женская одежда", 1.0, False, "Одежда И Обувь"),
    ("Сбербанк", "Самокат", "Доставка продуктов", 1.0, True, "Продукты И Напитки"),
    ("Газпромбанк", "Авиа билеты", "Авиа билеты", 1.0, False, "Путешествия"),
    ("Альфа-Банк", "Все покупки", "Прочее (УСЛУГИ)", 1.0, False, "Услуги"),
]
```

Adjust expected values to match regenerated catalog.

- [ ] **Step 2: Assert `unified_parent` in loop**

```python
expected_parent = case[5] if len(case) > 5 else None
ok = (
    result.unified_category == expected_sub
    and result.unified_subcategory == expected_sub
    and (expected_parent is None or result.unified_parent == expected_parent)
    and result.confidence == expected_conf
    and result.is_bank_offer == expected_bank_offer
)
```

- [ ] **Step 3: Run until green**

```bash
python3 scripts/verify_bank_catalog.py
```

Expected: `All checks passed`

---

### Task 6: Frontend types and matrix grouping

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/matrix.ts`

- [ ] **Step 1: Extend types** (per spec)

```typescript
export interface MappedItem {
  raw_category: string
  unified_category: string
  unified_subcategory?: string
  unified_parent?: string
  rate: number
  confidence: number
  is_bank_offer?: boolean
}

export interface MatrixRow {
  category: string
  parent?: string
  bankRaw?: string
  rates: Record<string, number>
}

export interface MatrixGroup {
  parent: string
  summaryRates: Record<string, number>
  rows: MatrixRow[]
}
```

- [ ] **Step 2: Update `mergeMappedItems` in `lib/matrix.ts`**

```typescript
for (const item of items) {
  if (item.is_bank_offer) continue
  const subcategory = item.unified_subcategory ?? item.unified_category
  const parent = item.unified_parent
  const existing = rowMap.get(subcategory) ?? {
    category: subcategory,
    parent,
    bankRaw: item.raw_category,
    rates: {},
  }
  existing.rates[provider.key] = item.rate
  if (!existing.parent && parent) existing.parent = parent
  rowMap.set(subcategory, existing)
}
```

- [ ] **Step 3: Add `groupMatrixRows`**

```typescript
export function groupMatrixRows(rows: MatrixRow[]): MatrixGroup[] {
  const byParent = new Map<string, MatrixRow[]>()
  for (const row of rows) {
    const parent = row.parent ?? row.category
    const list = byParent.get(parent) ?? []
    list.push(row)
    byParent.set(parent, list)
  }
  return Array.from(byParent.entries()).map(([parent, children]) => {
    const summaryRates: Record<string, number> = {}
    for (const child of children) {
      for (const [key, rate] of Object.entries(child.rates)) {
        summaryRates[key] = Math.max(summaryRates[key] ?? 0, rate)
      }
    }
    return { parent, summaryRates, rows: children }
  })
}
```

- [ ] **Step 4: Lint**

```bash
npm run lint
```

---

### Task 7: Results screen — accordion + flat toggle

**Files:**
- Modify: `components/screens/results-screen.tsx`

- [ ] **Step 1: Add state**

```typescript
const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
const [showAllSubcategories, setShowAllSubcategories] = useState(false)

function toggleParent(parent: string) {
  setExpandedParents((prev) => {
    const next = new Set(prev)
    if (next.has(parent)) next.delete(parent)
    else next.add(parent)
    return next
  })
}
```

- [ ] **Step 2: Import `groupMatrixRows`**

```typescript
import { groupMatrixRows } from "@/lib/matrix"
```

Compute: `const groups = groupMatrixRows(rows)` when not flat mode.

- [ ] **Step 3: Add toggle above matrix** (match existing card style from `option-c-bank-services` canvas)

```tsx
<div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
  <span className="text-[14px] text-slate-700">Все подкатегории</span>
  <button
    type="button"
    role="switch"
    aria-checked={showAllSubcategories}
    onClick={() => setShowAllSubcategories((v) => !v)}
    className={`relative h-6 w-11 rounded-full transition-colors ${showAllSubcategories ? "bg-slate-900" : "bg-slate-200"}`}
  >
    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${showAllSubcategories ? "translate-x-5" : ""}`} />
  </button>
</div>
```

- [ ] **Step 4: Flat mode** — render existing row loop over `rows`, add parent as subtitle:

```tsx
{row.parent && (
  <p className="text-[11px] text-slate-400">{row.parent}</p>
)}
```

- [ ] **Step 5: Accordion mode** — for each `group` in `groups`:

Parent row (`button`):
- Chevron `▶` / `▼` based on `expandedParents.has(group.parent)`
- Label: `group.parent`
- Rates from `getRowTiers(group.summaryRates)`

Children (when expanded, `AnimatePresence`):
- Indented `pl-6` rows for each `group.rows`
- Category = `child.category`
- Subtitle if `child.bankRaw !== child.category`: `child.bankRaw`

- [ ] **Step 6: Build check**

```bash
npm run build
```

Expected: compiles without errors.

---

### Task 8: Remove deprecated taxonomy.json

**Files:**
- Delete: `backend/data/taxonomy.json`
- Modify: any remaining imports referencing `taxonomy.json` (grep repo)

- [ ] **Step 1: Grep**

```bash
rg "taxonomy\.json" --glob '!docs/**'
```

Update or remove each reference.

- [ ] **Step 2: Delete file after all references gone**

- [ ] **Step 3: Final verification**

```bash
python3 scripts/verify_bank_catalog.py
npm run build
npm run lint
```

---

## Manual test checklist

1. Upload screenshots from 2–3 banks (Сбер + Альфа + ВТБ)
2. Results show ≤10 parent rows collapsed
3. Tap «Продукты И Напитки» → see «Доставка продуктов» with bank raw
4. Toggle «Все подкатегории» → flat list with parent subtitles
5. Tier colors work on both parent summary and child rows
6. Bank offers (`is_bank_offer`) still excluded from matrix

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| `category_hierarchy.json` | Task 1 |
| Catalog `unified_subcategory` + `unified_parent` | Task 3 |
| Mapper 108-leaf embedding | Task 4 |
| API compat `unified_category` | Task 4 |
| `taxonomy_migration.json` | Task 2 |
| Frontend accordion + toggle | Task 7 |
| `groupMatrixRows` / summary max | Task 6 |
| Verify cases | Task 5 |
| Deprecate `taxonomy.json` | Task 8 |
| Catch-all `Прочее (УСЛУГИ)` | Tasks 2, 4 |

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-17-cashpack-taxonomy.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement task-by-task in this session with checkpoints

Which approach do you prefer?
