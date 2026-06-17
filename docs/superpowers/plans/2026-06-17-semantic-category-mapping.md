# Semantic Two-Stage Category Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map bank OCR category names to CashPack hierarchy parent-first (26 macro) then leaf (108) only with explicit signal; hybrid fallback = enriched parent embeddings + Mistral parent classifier.

**Architecture:** Generate `parent_category_enriched.json` from hierarchy + disambiguation overrides; refactor `MapperService` into a 10-step cascade (catalog → synonyms → exact leaf/parent → parent embedding → scoped leaf embedding → LLM parent → fallback); mirror same two-stage logic in `sync_bank_catalog.py` for offline catalog quality.

**Tech Stack:** FastAPI, Pydantic v2, sentence-transformers (`paraphrase-multilingual-MiniLM-L12-v2`), Mistral Python SDK (`mistralai`), existing `category_hierarchy.json` + `bank_category_catalog.json`

**Spec:** [2026-06-17-semantic-category-mapping-design.md](../specs/2026-06-17-semantic-category-mapping-design.md)

**Prerequisite:** Branch with CashPack hierarchy (`category_hierarchy.json`), `bank_category_catalog.json`, `MapperService` hierarchy-aware (cashpack-taxonomy plan).

**Note:** Project has no pytest. Verification = `scripts/verify_bank_catalog.py` + inline Python one-liners.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/data/parent_category_disambiguation.json` | Curated disambiguation suffixes + extra aliases (hand-edited, small) |
| `scripts/generate_parent_enriched.py` | hierarchy + disambiguation → `parent_category_enriched.json` |
| `backend/data/parent_category_enriched.json` | `embedding_text`, `fallback_leaf`, `aliases` per parent (generated) |
| `backend/data/parent_category_synonyms.json` | Fast path: normalized bank text → parent name |
| `backend/services/category_embedding.py` | Shared encode + cosine argmax (runtime + sync script) |
| `backend/services/category_classifier_service.py` | Mistral parent-only classifier (step ⑨) |
| `backend/services/mapper_service.py` | Parent-first 10-step cascade |
| `backend/schemas.py` | Extended `match_source` literal |
| `scripts/sync_bank_catalog.py` | Two-stage offline resolver with embeddings |
| `scripts/verify_bank_catalog.py` | Regression cases from spec |
| `backend/env.example` | New env vars for thresholds + LLM fallback |
| `backend/main.py` | Wire classifier into `MapperService.load()` |

---

### Task 1: Disambiguation data + enriched parent generator

**Files:**
- Create: `backend/data/parent_category_disambiguation.json`
- Create: `scripts/generate_parent_enriched.py`
- Create: `backend/data/parent_category_enriched.json` (generated)

- [ ] **Step 1: Create disambiguation file**

`backend/data/parent_category_disambiguation.json`:

```json
{
  "Досуг И Отдых": {
    "suffix": "развлечения, кинотеатры, театры, парки аттракционов, хобби, спортивные мероприятия как зрелище",
    "extra_aliases": ["развлечения", "активный отдых"]
  },
  "Спорт И Активный Отдых": {
    "suffix": "товары для спорта, фитнес, туризм, велосипеды, спортивная обувь и одежда",
    "extra_aliases": ["спорт", "фитнес", "спортивные товары"]
  },
  "Продукты И Напитки": {
    "suffix": "доставка продуктов, напитки, готовая еда",
    "extra_aliases": ["яндекс лавка", "самокат", "корзина"]
  },
  "Путешествия": {
    "suffix": "авиа билеты, жд билеты, отели, туры",
    "extra_aliases": ["travel", "тревел"]
  }
}
```

- [ ] **Step 2: Create generator script**

`scripts/generate_parent_enriched.py`:

```python
#!/usr/bin/env python3
"""Generate backend/data/parent_category_enriched.json from category_hierarchy.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
HIERARCHY_PATH = REPO_ROOT / "backend" / "data" / "category_hierarchy.json"
DISAMBIG_PATH = REPO_ROOT / "backend" / "data" / "parent_category_disambiguation.json"
OUTPUT_PATH = REPO_ROOT / "backend" / "data" / "parent_category_enriched.json"


def normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def fallback_leaf_for_parent(parent_name: str, subcategories: list[dict]) -> str:
    for sub in subcategories:
        if sub["name"].lower().startswith("прочее"):
            return sub["name"]
    return subcategories[0]["name"] if subcategories else parent_name


def build_enriched(hierarchy: dict, disambig: dict) -> dict:
    result: dict[str, dict] = {}
    for parent in hierarchy.get("parents", []):
        name = parent["name"]
        children = [s["name"] for s in parent.get("subcategories", [])]
        base = f"{name}: {', '.join(children)}"
        entry = disambig.get(name, {})
        suffix = entry.get("suffix", "")
        embedding_text = f"{base}. {suffix}".strip() if suffix else base
        aliases = list(entry.get("extra_aliases", []))
        if normalize(name) not in {normalize(a) for a in aliases}:
            aliases.append(name)
        result[name] = {
            "aliases": sorted({normalize(a) for a in aliases}),
            "embedding_text": embedding_text,
            "fallback_leaf": fallback_leaf_for_parent(name, parent.get("subcategories", [])),
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    args = parser.parse_args()
    if not HIERARCHY_PATH.is_file():
        print(f"ERROR: missing {HIERARCHY_PATH}", file=sys.stderr)
        return 1
    hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
    disambig = {}
    if DISAMBIG_PATH.is_file():
        disambig = json.loads(DISAMBIG_PATH.read_text(encoding="utf-8"))
    out = build_enriched(hierarchy, disambig)
    OUTPUT_PATH.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH} ({len(out)} parents)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Run generator**

```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app
python3 scripts/generate_parent_enriched.py
```

Expected: `Wrote backend/data/parent_category_enriched.json (26 parents)`

- [ ] **Step 4: Spot-check disambiguation**

```bash
python3 -c "
import json
e = json.load(open('backend/data/parent_category_enriched.json'))
d = e['Досуг И Отдых']
s = e['Спорт И Активный Отдых']
assert 'активный отдых' in d['aliases']
assert 'парки аттракционов' in d['embedding_text'].lower()
assert 'фитнес' in s['embedding_text'].lower()
print('OK')
"
```

---

### Task 2: Fix parent synonyms

**Files:**
- Modify: `backend/data/parent_category_synonyms.json`

- [ ] **Step 1: Update synonym for Альфа «Активный отдых»**

Replace file content:

```json
{
  "активный отдых": "Досуг И Отдых",
  "развлечения": "Досуг И Отдых",
  "кафе и рестораны": "Кафе И Рестораны",
  "кафе, бары, рестораны": "Кафе И Рестораны",
  "одежда и обувь": "Одежда И Обувь"
}
```

- [ ] **Step 2: Verify normalized lookup**

```bash
python3 -c "
import json
s = json.load(open('backend/data/parent_category_synonyms.json'))
assert s['активный отдых'] == 'Досуг И Отдых'
print('OK')
"
```

---

### Task 3: Shared embedding utilities

**Files:**
- Create: `backend/services/category_embedding.py`

- [ ] **Step 1: Add reusable cosine helpers**

```python
from __future__ import annotations

import numpy as np
from sentence_transformers import SentenceTransformer


def encode_texts(model: SentenceTransformer, texts: list[str]) -> np.ndarray:
    if not texts:
        return np.empty((0, 0))
    return model.encode(texts, normalize_embeddings=True, show_progress_bar=False)


def best_match(
    query_embedding: np.ndarray,
    candidate_embeddings: np.ndarray,
) -> tuple[int, float]:
    if candidate_embeddings.size == 0:
        return -1, 0.0
    similarities = np.dot(candidate_embeddings, query_embedding)
    best_idx = int(np.argmax(similarities))
    return best_idx, float(similarities[best_idx])


def best_match_among(
    query_embedding: np.ndarray,
    candidate_embeddings: np.ndarray,
    allowed_indices: list[int],
) -> tuple[int, float]:
    if not allowed_indices:
        return -1, 0.0
    sub = candidate_embeddings[allowed_indices]
    local_idx, score = best_match(query_embedding, sub)
    if local_idx < 0:
        return -1, 0.0
    return allowed_indices[local_idx], score
```

---

### Task 4: Extend API schemas

**Files:**
- Modify: `backend/schemas.py`

- [ ] **Step 1: Extend `match_source` on `MappedItem`**

```python
match_source: Literal[
    "catalog",
    "override",
    "parent",
    "named",
    "leaf_exact",
    "parent_embedding",
    "leaf_embedding",
    "llm_parent",
    "fallback",
    "embedding",  # deprecated compat
] | None = None
```

---

### Task 5: CategoryClassifierService (Mistral parent-only)

**Files:**
- Create: `backend/services/category_classifier_service.py`

- [ ] **Step 1: Implement classifier**

```python
from __future__ import annotations

import json
import os
import re

from mistralai.client import Mistral

CLASSIFIER_PROMPT = """Ты классификатор банковских категорий кэшбэка.
Выбери ОДНУ родительскую категорию из списка (точное имя).

Банк: {bank_name}
Категория со скриншота: "{raw_category}"

Список родительских категорий:
{parent_list}

Верни ТОЛЬКО JSON: {{"parent": "<имя из списка>", "confidence": <0.0-1.0>}}
"""


class CategoryClassifierService:
    def __init__(self, parent_names: list[str]) -> None:
        self._parents = parent_names
        self._parent_set = set(parent_names)
        self._client: Mistral | None = None

    def _get_client(self) -> Mistral:
        if self._client is None:
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                raise RuntimeError("MISTRAL_API_KEY is not configured")
            self._client = Mistral(api_key=api_key)
        return self._client

    def classify_parent(self, raw_category: str, bank_name: str | None) -> tuple[str | None, float]:
        if not os.environ.get("CATEGORY_LLM_FALLBACK", "true").lower() in {"1", "true", "yes"}:
            return None, 0.0

        parent_list = "\n".join(f"- {name}" for name in self._parents)
        prompt = CLASSIFIER_PROMPT.format(
            bank_name=bank_name or "неизвестен",
            raw_category=raw_category,
            parent_list=parent_list,
        )
        client = self._get_client()
        response = client.chat.complete(
            model=os.environ.get("MISTRAL_CLASSIFIER_MODEL", "mistral-small-latest"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        data = json.loads(cleaned)
        parent = str(data.get("parent", "")).strip()
        confidence = float(data.get("confidence", 0.0))
        if parent not in self._parent_set:
            return None, 0.0
        return parent, confidence
```

- [ ] **Step 2: Smoke-test classifier (optional, needs `MISTRAL_API_KEY`)**

```bash
cd backend
python3 -c "
from services.category_classifier_service import CategoryClassifierService
import json
h = json.load(open('data/category_hierarchy.json'))
parents = [p['name'] for p in h['parents']]
svc = CategoryClassifierService(parents)
p, c = svc.classify_parent('Активный отдых', 'Альфа-Банк')
print(p, c)
"
```

Expected (approx): `Досуг И Отдых` with confidence > 0.5

---

### Task 6: Refactor MapperService — parent-first cascade

**Files:**
- Modify: `backend/services/mapper_service.py`
- Modify: `backend/main.py` (pass classifier optional — can init inside `load()`)

- [ ] **Step 1: Add new paths and state in `load()`**

At top of `mapper_service.py`, add imports and paths:

```python
from services.category_classifier_service import CategoryClassifierService
from services.category_embedding import best_match, best_match_among, encode_texts

ENRICHED_PATH = Path(__file__).resolve().parent.parent / "data" / "parent_category_enriched.json"
DEFAULT_PARENT_THRESHOLD = 0.55
DEFAULT_LEAF_THRESHOLD = 0.60
```

In `MapperService.__init__`, add fields:

```python
self._parents: list[str] = []
self._parent_embeddings: np.ndarray | None = None
self._parent_embedding_texts: list[str] = []
self._parent_to_child_indices: dict[str, list[int]] = {}
self._parent_threshold = float(os.environ.get("CATEGORY_PARENT_THRESHOLD", DEFAULT_PARENT_THRESHOLD))
self._leaf_threshold = float(os.environ.get("CATEGORY_LEAF_THRESHOLD", DEFAULT_LEAF_THRESHOLD))
self._classifier: CategoryClassifierService | None = None
self._enriched: dict[str, dict] = {}
```

In `load()`, after loading hierarchy:

```python
self._parents = [p["name"] for p in hierarchy.get("parents", [])]
self._enriched = json.loads(ENRICHED_PATH.read_text(encoding="utf-8"))
self._parent_embedding_texts = [
    self._enriched[name]["embedding_text"] for name in self._parents
]
# existing leaf encode ...
self._parent_embeddings = encode_texts(self._model, self._parent_embedding_texts)
self._parent_to_child_indices = {}
for idx, leaf in enumerate(self._subcategories):
    parent = self._subcategory_to_parent.get(_normalize_category_name(leaf))
    if parent:
        self._parent_to_child_indices.setdefault(parent, []).append(idx)
self._classifier = CategoryClassifierService(self._parents)
```

- [ ] **Step 2: Add helper `_macro_item` behavior in `_mapped_item`**

When `is_macro_category=True`, set `unified_subcategory = unified_parent = parent` and `unified_category = parent`.

- [ ] **Step 3: Add `_resolve_exact_leaf` and `_resolve_exact_parent`**

```python
def _resolve_exact_leaf(self, normalized: str) -> str | None:
    for leaf in self._subcategories:
        if _normalize_category_name(leaf) == normalized:
            return leaf
    return None

def _resolve_exact_parent(self, normalized: str) -> str | None:
    if normalized in self._normalized_to_parent:
        return self._normalized_to_parent[normalized]
    return None
```

- [ ] **Step 4: Add `_match_parent_embedding`**

```python
def _match_parent_embedding(self, query_embedding: np.ndarray) -> tuple[str | None, float]:
    idx, score = best_match(query_embedding, self._parent_embeddings)
    if idx < 0 or score < self._parent_threshold:
        return None, score
    return self._parents[idx], score
```

- [ ] **Step 5: Add `_match_leaf_in_parent`**

```python
def _match_leaf_in_parent(
    self,
    query_embedding: np.ndarray,
    parent: str,
    normalized: str,
) -> tuple[str | None, float, Literal["leaf_exact", "leaf_embedding"] | None]:
    exact = self._resolve_exact_leaf(normalized)
    if exact and self._resolve_parent(exact) == parent:
        return exact, 1.0, "leaf_exact"
    child_indices = self._parent_to_child_indices.get(parent, [])
    if not child_indices:
        return None, 0.0, None
    idx, score = best_match_among(query_embedding, self._subcategory_embeddings, child_indices)
    if idx < 0 or score < self._leaf_threshold:
        return None, score, None
    return self._subcategories[idx], score, "leaf_embedding"
```

- [ ] **Step 6: Rewrite `map_items` cascade**

Replace the pending/embedding block with this logic per item (pseudocode — implement inline):

```python
# After steps ②–⑤ (catalog, named, parent_synonym, override) still return early as today

normalized = _normalize_category_name(item.raw_category)

# ⑥ exact leaf (global)
leaf = self._resolve_exact_leaf(normalized)
if leaf:
    return macro=False, leaf, self._resolve_parent(leaf), 1.0, "leaf_exact"

# exact parent name
parent_exact = self._resolve_exact_parent(normalized)
if parent_exact:
    return macro=True, parent_exact, parent_exact, 1.0, "parent"

query_embedding = ...  # encode single item

# ⑦ parent embedding
parent, parent_score = self._match_parent_embedding(query_embedding)
if parent:
    # ⑧ try leaf only inside parent
    leaf, leaf_score, leaf_source = self._match_leaf_in_parent(query_embedding, parent, normalized)
    if leaf and leaf_source:
        return macro=False, leaf, parent, leaf_score, leaf_source
    return macro=True, parent, parent, parent_score, "parent_embedding"

# ⑨ LLM parent
if self._classifier:
    llm_parent, llm_conf = self._classifier.classify_parent(item.raw_category, source_name)
    if llm_parent:
        return macro=True, llm_parent, llm_parent, llm_conf, "llm_parent"

# ⑩ fallback
return macro=False, FALLBACK_SUBCATEGORY, FALLBACK_PARENT, parent_score, "fallback"
```

Remove old flat `np.dot(self._subcategory_embeddings, ...)` over all 108 leaves.

- [ ] **Step 7: Add structured log per mapped item**

```python
print(
    f"map: raw={item.raw_category!r} bank={bank_slug!r} "
    f"parent={resolved_parent!r} sub={subcategory!r} "
    f"source={match_source} conf={confidence}"
)
```

- [ ] **Step 8: Run mapper smoke (no LLM needed for synonym path)**

```bash
cd backend
python3 -c "
from schemas import CategoryMapRequestItem
from services.mapper_service import MapperService
m = MapperService(); m.load()
r = m.map_items([CategoryMapRequestItem(raw_category='Активный отдых', rate=5)], 'Альфа-Банк')[0]
assert r.unified_parent == 'Досуг И Отдых'
assert r.is_macro_category
assert r.match_source == 'parent'
print('OK', r.unified_category, r.confidence)
"
```

Expected: `OK Досуг И Отдых 1.0`

---

### Task 7: Two-stage offline catalog sync

**Files:**
- Modify: `scripts/sync_bank_catalog.py`

- [ ] **Step 1: Import embedding stack for offline use**

At top of `sync_bank_catalog.py`:

```python
import os
import numpy as np
from sentence_transformers import SentenceTransformer

ENRICHED_PATH = REPO_ROOT / "backend" / "data" / "parent_category_enriched.json"
PARENT_THRESHOLD = float(os.environ.get("CATEGORY_PARENT_THRESHOLD", 0.55))
LEAF_THRESHOLD = float(os.environ.get("CATEGORY_LEAF_THRESHOLD", 0.60))
```

- [ ] **Step 2: Replace `resolve_cashpack_leaf` with two-stage resolver**

```python
def resolve_two_stage(
    raw: str,
    bank_category: str,
    *,
    leaves: set[str],
    leaf_to_parent: dict[str, str],
    normalized_to_leaf: dict[str, str],
    normalized_to_parent: dict[str, str],
    parent_synonyms: dict[str, str],
    overrides: dict[str, str],
    migration: dict[str, str],
    parents: list[str],
    parent_embeddings: np.ndarray,
    parent_names: list[str],
    subcategory_names: list[str],
    subcategory_embeddings: np.ndarray,
    parent_to_child_indices: dict[str, list[int]],
    model: SentenceTransformer,
) -> tuple[str | None, str | None, bool]:
    for candidate in (raw, bank_category):
        if not candidate:
            continue
        key = normalize(candidate)

        if key in overrides:
            leaf = overrides[key]
            return leaf, leaf_to_parent.get(normalize(leaf)), False

        if key in parent_synonyms:
            parent = parent_synonyms[key]
            return parent, parent, True

        if key in normalized_to_parent:
            parent = normalized_to_parent[key]
            return parent, parent, True

        if key in normalized_to_leaf:
            leaf = normalized_to_leaf[key]
            return leaf, leaf_to_parent.get(key), False

        if key in migration:
            leaf = migration[key]
            return leaf, leaf_to_parent.get(normalize(leaf)), False

    # embedding path: use bank_category as primary semantic signal
    query_text = bank_category or raw
    q = model.encode([query_text], normalize_embeddings=True, show_progress_bar=False)[0]

    p_idx = int(np.argmax(np.dot(parent_embeddings, q)))
    p_score = float(np.dot(parent_embeddings[p_idx], q))
    if p_score < PARENT_THRESHOLD:
        return None, None, False

    parent = parent_names[p_idx]
    child_indices = parent_to_child_indices.get(parent, [])
    if child_indices:
        sub_embs = subcategory_embeddings[child_indices]
        l_local = int(np.argmax(np.dot(sub_embs, q)))
        l_score = float(sub_embs[l_local] @ q)
        if l_score >= LEAF_THRESHOLD:
            leaf = subcategory_names[child_indices[l_local]]
            # only accept leaf if raw matches subcategory signal
            if normalize(raw) == normalize(leaf) or normalize(raw) != normalize(bank_category):
                return leaf, parent, False

    return parent, parent, True
```

Key rule for offline: when `raw` is a subcategory string from scraped data that exactly matches a CashPack leaf name, step 1 (exact leaf) already handles it. When `raw` is `category_name` only, return macro parent — **do not** force a leaf.

- [ ] **Step 3: Build embedding indexes in `build_catalog()`**

Load enriched JSON, encode parents + all subcategories once before the offer loop (mirror `MapperService.load()`).

- [ ] **Step 4: Regenerate catalog**

```bash
python3 scripts/sync_bank_catalog.py
```

Expected: fewer `WARN: unmapped` lines; no entries where `bank_category` is «Супермаркеты» but leaf is «Авиа билеты».

- [ ] **Step 5: Spot-check ГПБ travel rows**

```bash
python3 -c "
import json
c = json.load(open('backend/data/bank_category_catalog.json'))
e = c['gazprombank']['авиа билеты']
assert e['unified_subcategory'] == 'Авиа билеты'
assert e['unified_parent'] == 'Путешествия'
assert e['bank_category'] == 'Супермаркеты'  # bank's own grouping label — OK
print('OK')
"
```

---

### Task 8: Verification script update

**Files:**
- Modify: `scripts/verify_bank_catalog.py`

- [ ] **Step 1: Update `CASES` to match spec**

Replace the «Активный отдых» row and fix macro expectations:

```python
# source, raw, expected_sub, expected_conf, is_bank_offer, expected_parent, expected_macro, expected_source
CASES = [
    ("Сбер", "Аптеки", "Аптеки", 1.0, False, "Медицина И Здоровье", False, "catalog"),
    ("Яндекс Банк", "Яндекс Лавка", "Доставка продуктов", 1.0, True, "Продукты И Напитки", False, "catalog"),
    ("Альфа-Банк", "Активный отдых", "Досуг И Отдых", 1.0, False, "Досуг И Отдых", True, "parent"),
    ("Альфа-Банк", "Кинотеатры, театры, выставки", "Кинотеатры, театры, выставки", 1.0, False, "Досуг И Отдых", False, None),
    ("Газпромбанк", "Кафе и рестораны", "Кафе И Рестораны", 1.0, False, "Кафе И Рестораны", True, "catalog"),
    ("Газпромбанк", "АЗС", "Топливо", 1.0, False, "Авто", False, "catalog"),
    ("ОТП Банк", "АЗС", "Топливо", 1.0, False, "Авто", False, None),
    ("Сбербанк", "Самокат", "Доставка продуктов", 1.0, True, "Продукты И Напитки", False, "catalog"),
    ("Альфа-Банк", "Все покупки", "Прочее (УСЛУГИ)", 1.0, False, "Услуги", False, "catalog"),
    ("Газпромбанк", "Авиа билеты", "Авиа билеты", 1.0, False, "Путешествия", False, "catalog"),
]
```

Extend assertion loop to check `is_macro_category` and optionally `match_source` when not `None`.

- [ ] **Step 2: Run verification**

```bash
python3 scripts/verify_bank_catalog.py
```

Expected: `All checks passed`

---

### Task 9: Env documentation

**Files:**
- Modify: `backend/env.example`

- [ ] **Step 1: Add new variables**

```bash
CATEGORY_PARENT_THRESHOLD=0.55
CATEGORY_LEAF_THRESHOLD=0.60
CATEGORY_LLM_FALLBACK=true
MISTRAL_CLASSIFIER_MODEL=mistral-small-latest
```

Keep `CATEGORY_MAP_THRESHOLD` commented as deprecated or remove if no longer read.

---

### Task 10: End-to-end smoke

- [ ] **Step 1: Start backend and hit `/api/category/map`**

```bash
cd backend
uvicorn main:app --port 8000 &
sleep 15  # model load
curl -s -X POST http://localhost:8000/api/category/map \
  -H 'Content-Type: application/json' \
  -d '{"source_name":"Альфа-Банк","items":[{"raw_category":"Активный отдых","rate":5}]}' | python3 -m json.tool
```

Expected JSON fragment:

```json
"unified_parent": "Досуг И Отдых",
"unified_subcategory": "Досуг И Отдых",
"is_macro_category": true,
"match_source": "parent"
```

- [ ] **Step 2: Frontend build (no UI changes expected)**

```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app
npm run build
```

Expected: build succeeds.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `parent_category_enriched.json` | Task 1 |
| Fix `активный отдых` synonym | Task 2 |
| Parent embeddings (26 enriched) | Task 1, 6 |
| Leaf embedding scoped to parent | Task 6, 7 |
| LLM parent classifier step ⑨ | Task 5, 6 |
| Extended `match_source` | Task 4 |
| Offline two-stage catalog sync | Task 7 |
| No auto «Прочее» when only parent known | Task 6 (macro path) |
| Verification cases from spec | Task 8 |
| Env vars | Task 9 |
| Logging | Task 6 step 7 |

## Out of scope (do not implement)

- LLM leaf classification
- UI changes
- PostgreSQL / persistence

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-semantic-category-mapping.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints after Tasks 6 and 8

Which approach do you prefer?
