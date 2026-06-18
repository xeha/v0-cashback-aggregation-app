# Supermarket Category Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Маппить OCR-категории со скриншотов супермаркетов в единую таксономию (29 L1 + 265 L2) через `MarketMapperService`, по тому же принципу, что банковский `MapperService`.

**Architecture:** `kind: "market"` в существующих endpoints `/api/ocr/extract` и `/api/category/map`. Роутер диспатчит в `MarketMapperService`, который использует shared `SentenceTransformer`, per-market catalog lookup, overrides и embedding cascade. Unified taxonomy генерируется из `supermarket_catalog_tree.json`. Frontend убирает bypass `mapMarketItemsFromOcr`.

**Tech Stack:** FastAPI, Python 3.11, sentence-transformers, Mistral Vision (OCR), Next.js 16, TypeScript, verify-скрипты (pytest в проекте нет).

**Spec:** `docs/superpowers/specs/2026-06-18-supermarket-category-mapping-design.md`

**Estimated total:** ~6–8 h (код ~4 h, seed catalog data-prep ~2–4 h параллельно)

---

## File Map

| File | Responsibility |
|------|----------------|
| `backend/data/supermarket_catalog_tree.json` | Исходное дерево L1/L2 (копия из obsidian) |
| `backend/data/supermarket_category_hierarchy.json` | Flat lists + parent map для mapper |
| `backend/data/market_parent_enriched.json` | Embedding-тексты L1 |
| `backend/data/market_aliases.json` | «Пятёрочка» → `pyaterochka` |
| `backend/data/market_category_catalog.json` | Per-market raw → unified |
| `backend/data/market_category_overrides.json` | Глобальные синонимы |
| `backend/data/market_parent_synonyms.json` | raw ≈ L1 |
| `scripts/generate_supermarket_hierarchy.py` | Генерация hierarchy + enriched |
| `scripts/auto_map_market_catalog.py` | Auto-map parsed chain L2 → unified |
| `scripts/verify_market_catalog.py` | Прогон кейсов |
| `backend/services/market_slug_resolver.py` | `resolve_market_slug()` |
| `backend/services/market_mapper_service.py` | Cascade matching для market |
| `backend/services/mapper_service.py` | Принять optional shared model |
| `backend/schemas.py` | `kind`, `source_slug` |
| `backend/main.py` | Shared model + оба mapper'а |
| `backend/routers/category.py` | Dispatch по `kind` |
| `backend/routers/ocr.py` | Pass `kind` to OCR service |
| `backend/services/ocr_service.py` | Два промпта |
| `lib/api.ts` | Wire `kind`/`sourceSlug`, убрать bypass |

---

### Task 1: Data foundation — catalog tree + hierarchy generation (~30 min)

**Files:**
- Create: `backend/data/supermarket_catalog_tree.json`
- Create: `scripts/generate_supermarket_hierarchy.py`
- Create: `backend/data/supermarket_category_hierarchy.json` (generated)
- Create: `backend/data/market_parent_enriched.json` (generated)
- Create: `backend/data/market_category_overrides.json`
- Create: `backend/data/market_parent_synonyms.json`
- Create: `backend/data/market_category_catalog.json`

- [ ] **Step 1: Скопировать catalog tree**

```bash
cp "/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/supermarket_catalog_tree.json" \
   backend/data/supermarket_catalog_tree.json
```

- [ ] **Step 2: Создать пустые JSON-заготовки**

`backend/data/market_category_overrides.json`:
```json
{}
```

`backend/data/market_parent_synonyms.json`:
```json
{}
```

`backend/data/market_category_catalog.json`:
```json
{
  "magnit": {},
  "pyaterochka": {},
  "lenta": {}
}
```

- [ ] **Step 3: Создать `scripts/generate_supermarket_hierarchy.py`**

```python
#!/usr/bin/env python3
"""Generate supermarket_category_hierarchy.json and market_parent_enriched.json from tree."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TREE_PATH = ROOT / "backend" / "data" / "supermarket_catalog_tree.json"
HIERARCHY_PATH = ROOT / "backend" / "data" / "supermarket_category_hierarchy.json"
ENRICHED_PATH = ROOT / "backend" / "data" / "market_parent_enriched.json"

FALLBACK_L1 = "Прочее"
FALLBACK_L2 = "Прочее"


def _normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def main() -> None:
    tree = json.loads(TREE_PATH.read_text(encoding="utf-8"))
    categories = tree["categories"]

    parents: list[dict] = []
    subcategory_names: list[str] = []
    subcategory_to_parent: dict[str, str] = {}

    for cat in categories:
        l1_name = cat["name"]
        subs = [s["name"] for s in cat.get("subcategories", [])]
        parents.append({"id": cat["id"], "name": l1_name, "subcategories": cat.get("subcategories", [])})
        for sub in subs:
            subcategory_names.append(sub)
            subcategory_to_parent[_normalize(sub)] = l1_name

    # Fallback pair for unmapped OCR categories
    if not any(p["name"] == FALLBACK_L1 for p in parents):
        parents.append({"id": 999, "name": FALLBACK_L1, "subcategories": [{"id": "999.1", "name": FALLBACK_L2}]})
    if FALLBACK_L2 not in subcategory_names:
        subcategory_names.append(FALLBACK_L2)
        subcategory_to_parent[_normalize(FALLBACK_L2)] = FALLBACK_L1

    hierarchy = {
        "source": str(TREE_PATH.name),
        "total_parents": len(parents),
        "total_subcategories": len(subcategory_names),
        "parents": parents,
        "subcategory_names": subcategory_names,
        "subcategory_to_parent": subcategory_to_parent,
    }
    HIERARCHY_PATH.write_text(json.dumps(hierarchy, ensure_ascii=False, indent=2), encoding="utf-8")

    enriched: dict[str, dict] = {}
    for parent in parents:
        name = parent["name"]
        child_names = [s["name"] for s in parent.get("subcategories", [])]
        enriched[name] = {
            "aliases": [_normalize(name)],
            "embedding_text": f"{name}: {', '.join(child_names)}",
            "fallback_leaf": child_names[-1] if child_names else FALLBACK_L2,
        }

    ENRICHED_PATH.write_text(json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {HIERARCHY_PATH} ({len(parents)} parents, {len(subcategory_names)} subcategories)")
    print(f"Wrote {ENRICHED_PATH}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Запустить генерацию**

```bash
python3 scripts/generate_supermarket_hierarchy.py
```

Expected:
```
Wrote .../supermarket_category_hierarchy.json (30 parents, 266 subcategories)
Wrote .../market_parent_enriched.json
```

(30 parents = 29 из tree + 1 fallback «Прочее»)

- [ ] **Step 5: Commit**

```bash
git add backend/data/supermarket_catalog_tree.json \
        backend/data/supermarket_category_hierarchy.json \
        backend/data/market_parent_enriched.json \
        backend/data/market_category_overrides.json \
        backend/data/market_parent_synonyms.json \
        backend/data/market_category_catalog.json \
        scripts/generate_supermarket_hierarchy.py
git commit -m "feat: add supermarket taxonomy data and hierarchy generator"
```

---

### Task 2: Market slug resolver + aliases (~15 min)

**Files:**
- Create: `backend/services/market_slug_resolver.py`
- Create: `backend/data/market_aliases.json`

- [ ] **Step 1: Создать `backend/data/market_aliases.json`**

```json
{
  "пятёрочка": "pyaterochka",
  "пятерочка": "pyaterochka",
  "5ka": "pyaterochka",
  "магнит": "magnit",
  "магнит у дома": "magnit",
  "магнит семейный": "magnit",
  "лента": "lenta",
  "лента супер": "lenta"
}
```

- [ ] **Step 2: Создать `backend/services/market_slug_resolver.py`**

```python
import json
from pathlib import Path

ALIASES_PATH = Path(__file__).resolve().parent.parent / "data" / "market_aliases.json"


def _normalize_market_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def load_market_aliases() -> dict[str, str]:
    with ALIASES_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)
    return {_normalize_market_name(key): slug for key, slug in raw.items()}


def resolve_market_slug(
    source_name: str | None,
    source_slug: str | None = None,
    aliases: dict[str, str] | None = None,
) -> str | None:
    if source_slug and source_slug.strip():
        return source_slug.strip().lower()
    if not source_name or not source_name.strip():
        return None
    mapping = aliases if aliases is not None else load_market_aliases()
    return mapping.get(_normalize_market_name(source_name))
```

- [ ] **Step 3: Commit**

```bash
git add backend/data/market_aliases.json backend/services/market_slug_resolver.py
git commit -m "feat: add market slug resolver and aliases"
```

---

### Task 3: Shared embeddings model in lifespan (~20 min)

**Files:**
- Modify: `backend/services/mapper_service.py`
- Modify: `backend/main.py`
- Modify: `backend/schemas.py`

- [ ] **Step 1: Обновить `MapperService.load()` — optional shared model**

В `backend/services/mapper_service.py` изменить сигнатуру и загрузку модели:

```python
def load(self, model: SentenceTransformer | None = None) -> None:
    # ... existing hierarchy/overrides/catalog loading unchanged ...

    if model is not None:
        self._model = model
    else:
        model_name = os.environ.get(
            "SENTENCE_TRANSFORMER_MODEL",
            "paraphrase-multilingual-MiniLM-L12-v2",
        )
        self._model = SentenceTransformer(model_name)

    self._subcategory_embeddings = encode_texts(self._model, self._subcategories)
    self._parent_embeddings = encode_texts(self._model, self._parent_embedding_texts)
    # ... rest unchanged ...
```

- [ ] **Step 2: Расширить `HealthResponse` в `backend/schemas.py`**

```python
class HealthResponse(BaseModel):
    status: str
    mapper_loaded: bool
    bank_mapper_loaded: bool = False
    market_mapper_loaded: bool = False
```

- [ ] **Step 3: Обновить `backend/main.py` lifespan**

```python
import os
from sentence_transformers import SentenceTransformer

from services.market_mapper_service import MarketMapperService
from services.mapper_service import MapperService

@asynccontextmanager
async def lifespan(app: FastAPI):
    model_name = os.environ.get(
        "SENTENCE_TRANSFORMER_MODEL",
        "paraphrase-multilingual-MiniLM-L12-v2",
    )
    shared_model = SentenceTransformer(model_name)

    bank_mapper = MapperService()
    bank_mapper.load(model=shared_model)

    market_mapper = MarketMapperService()
    market_mapper.load(model=shared_model)

    app.state.mapper = bank_mapper  # backward compat
    app.state.bank_mapper = bank_mapper
    app.state.market_mapper = market_mapper
    yield
```

- [ ] **Step 4: Обновить `/health`**

```python
@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    bank_mapper: MapperService | None = getattr(app.state, "bank_mapper", None)
    market_mapper: MarketMapperService | None = getattr(app.state, "market_mapper", None)
    bank_loaded = bool(bank_mapper and bank_mapper.is_loaded)
    market_loaded = bool(market_mapper and market_mapper.is_loaded)
    return HealthResponse(
        status="ok",
        mapper_loaded=bank_loaded,
        bank_mapper_loaded=bank_loaded,
        market_mapper_loaded=market_loaded,
    )
```

**Порядок:** Task 3 Step 1 → Task 4 полностью → Task 3 Steps 2–4 (main.py требует `MarketMapperService`).

- [ ] **Step 5: Commit (после Task 4)**

```bash
git add backend/services/mapper_service.py backend/schemas.py backend/main.py
git commit -m "feat: shared sentence-transformer model for bank and market mappers"
```

---

### Task 4: MarketMapperService (~90 min)

**Files:**
- Create: `backend/services/market_mapper_service.py`

- [ ] **Step 1: Создать `backend/services/market_mapper_service.py`**

Скопировать структуру из `mapper_service.py`, убрать bank-specific части (`bank_offer`, `named_categories`, LLM classifier). Ключевые отличия:

```python
HIERARCHY_PATH = Path(__file__).resolve().parent.parent / "data" / "supermarket_category_hierarchy.json"
OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "market_category_overrides.json"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "market_category_catalog.json"
ENRICHED_PATH = Path(__file__).resolve().parent.parent / "data" / "market_parent_enriched.json"
PARENT_SYNONYMS_PATH = Path(__file__).resolve().parent.parent / "data" / "market_parent_synonyms.json"
FALLBACK_SUBCATEGORY = "Прочее"
FALLBACK_PARENT = "Прочее"
```

Catalog entry fields: `market_category`, `unified_subcategory`, `unified_parent`, `is_macro` (mirror bank's `_catalog_unified` / `_catalog_signature`).

`_mapped_item`: always `is_bank_offer=False`. No LLM step in MVP — после parent embedding failure → fallback.

`map_items` signature:

```python
def map_items(
    self,
    items: list[CategoryMapRequestItem],
    source_name: str | None = None,
    source_slug: str | None = None,
) -> list[MappedItem]:
```

`load(self, model: SentenceTransformer) -> None` — model required (shared from lifespan).

Переиспользовать `_build_catalog_indexes` — скопировать функцию или вынести в `services/catalog_index.py` (YAGNI: скопировать).

- [ ] **Step 2: Smoke-test mapper в Python REPL**

```bash
cd backend && .venv/bin/python -c "
from sentence_transformers import SentenceTransformer
from schemas import CategoryMapRequestItem
from services.market_mapper_service import MarketMapperService

model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
mapper = MarketMapperService()
mapper.load(model=model)
item = mapper.map_items([CategoryMapRequestItem(raw_category='Молоко', rate=10.0)], 'Магнит', 'magnit')[0]
print(item.unified_category, item.unified_parent, item.confidence, item.match_source)
"
```

Expected: `Молокo` (or close unified L2) / parent containing milk category / confidence > 0.6 / `leaf_embedding` or `leaf_exact`

- [ ] **Step 3: Commit**

```bash
git add backend/services/market_mapper_service.py
git commit -m "feat: add MarketMapperService with embedding cascade"
```

---

### Task 5: API schemas + category router dispatch (~20 min)

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/routers/category.py`

- [ ] **Step 1: Добавить `kind` и `source_slug` в request schemas**

```python
class OcrExtractRequest(BaseModel):
    image_base64: str = Field(..., min_length=1)
    mime_type: Literal["image/jpeg", "image/png", "image/jpg"] = "image/jpeg"
    kind: Literal["bank", "market"] = "bank"

class CategoryMapRequest(BaseModel):
    items: list[CategoryMapRequestItem]
    source_name: str | None = None
    kind: Literal["bank", "market"] = "bank"
    source_slug: str | None = None
```

- [ ] **Step 2: Обновить `backend/routers/category.py`**

```python
def _get_bank_mapper(request: Request) -> MapperService:
    mapper: MapperService | None = getattr(request.app.state, "bank_mapper", None) or getattr(
        request.app.state, "mapper", None
    )
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Bank category mapper is not ready")
    return mapper


def _get_market_mapper(request: Request) -> MarketMapperService:
    mapper: MarketMapperService | None = getattr(request.app.state, "market_mapper", None)
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Market category mapper is not ready")
    return mapper


@router.post("/map", response_model=CategoryMapResponse)
def category_map(body: CategoryMapRequest, request: Request) -> CategoryMapResponse:
    try:
        if body.kind == "market":
            mapper = _get_market_mapper(request)
            items = mapper.map_items(body.items, body.source_name, body.source_slug)
        else:
            mapper = _get_bank_mapper(request)
            items = mapper.map_items(body.items, body.source_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Category mapping failed: {exc}") from exc
    return CategoryMapResponse(items=items)
```

- [ ] **Step 3: Curl-test market mapping**

```bash
curl -s -X POST http://localhost:8000/api/category/map \
  -H 'Content-Type: application/json' \
  -d '{"kind":"market","source_name":"Магнит","source_slug":"magnit","items":[{"raw_category":"Молоко","rate":10}]}' \
  | python3 -m json.tool
```

Expected: `unified_category` = L2 «Молокo», `unified_parent` = «Молокo, сыр, яйца», `is_macro_category: false`

- [ ] **Step 4: Commit**

```bash
git add backend/schemas.py backend/routers/category.py backend/main.py
git commit -m "feat: dispatch category mapping by kind"
```

---

### Task 6: OCR prompt split (~25 min)

**Files:**
- Modify: `backend/services/ocr_service.py`
- Modify: `backend/routers/ocr.py`

- [ ] **Step 1: Переименовать текущий промпт и добавить market prompt**

В `ocr_service.py`:

```python
OCR_PROMPT_BANK = """..."""  # текущий OCR_PROMPT без изменений содержания

OCR_PROMPT_MARKET = """Извлеки из скриншота мобильного приложения супермаркета пары «товарная категория кэшбэка — процент».

Правила формата:
- Верни ТОЛЬКО валидный JSON-массив без markdown и пояснений
- Формат: [{"raw_category": "название", "rate": число}]
- rate — целое или дробное число процента (10 для «10%», 7.5 для «7,5%»)
- Сохраняй оригинальные русские названия категорий как на скриншоте
- Каждая строка списка кэшбэка — отдельная категория («Молокo», «Кисломолочка», «Твёрдые сыры»)
- НЕ выдумывай категории — только явно видимые строки
- Игнорируй промо-баннеры, заголовки, даты, кнопки
- Если на изображении НЕТ экрана кэшбэка супермаркета — верни []"""
```

- [ ] **Step 2: Обновить `extract_cashback_items`**

```python
def extract_cashback_items(
    image_base64: str,
    mime_type: str,
    kind: Literal["bank", "market"] = "bank",
) -> list[OcrItem]:
    prompt = OCR_PROMPT_MARKET if kind == "market" else OCR_PROMPT_BANK
    # ... use `prompt` instead of OCR_PROMPT in messages ...
    parsed_items = _parse_ocr_json(content)  # без filter_bank_services для market
    if kind == "market":
        return parsed_items
    return filter_bank_services(parsed_items)
```

Refactor: `_parse_and_filter_ocr_json` split — `_parse_ocr_json` уже есть; для bank apply filter after parse.

- [ ] **Step 3: Обновить `backend/routers/ocr.py`**

```python
items = extract_cashback_items(body.image_base64, body.mime_type, body.kind)
```

- [ ] **Step 4: Commit**

```bash
git add backend/services/ocr_service.py backend/routers/ocr.py
git commit -m "feat: separate OCR prompts for bank and market"
```

---

### Task 7: Frontend wiring (~20 min)

**Files:**
- Modify: `lib/api.ts`

- [ ] **Step 1: Обновить `extractOcr` и `mapCategories`**

```typescript
import type { Kind } from "@/lib/types"

export async function extractOcr(
  image_base64: string,
  mime_type: string,
  kind: Kind = "bank",
): Promise<OcrExtractResponse> {
  return postJson<OcrExtractResponse>("/api/ocr/extract", {
    image_base64,
    mime_type,
    kind,
  })
}

export async function mapCategories(
  items: { raw_category: string; rate: number }[],
  source_name?: string,
  options?: { kind?: Kind; sourceSlug?: string },
): Promise<CategoryMapResponse> {
  return postJson<CategoryMapResponse>("/api/category/map", {
    items,
    source_name,
    kind: options?.kind ?? "bank",
    source_slug: options?.sourceSlug,
  })
}
```

- [ ] **Step 2: Обновить `processSubmission` — убрать bypass**

Удалить функцию `mapMarketItemsFromOcr` целиком.

```typescript
const ocr = await extractOcr(image_base64, mime_type, submission.kind)

if (ocr.items.length === 0) {
  throw new OcrEmptyError()
}

const mappedItems = (
  await mapCategories(ocr.items, submission.providerName, {
    kind: submission.kind,
    sourceSlug: submission.providerSlug,
  })
).items as MappedItem[]

if (isUnreliableMapping(mappedItems)) {
  throw new OcrUnreliableError()
}
```

(Убрать `if (submission.kind !== "market" && isUnreliableMapping)` — проверять для обоих kind.)

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/api.ts
git commit -m "feat: wire market category mapping through backend API"
```

---

### Task 8: Bootstrap seed catalog from demo rows (~30 min)

**Files:**
- Modify: `backend/data/market_category_catalog.json`
- Modify: `scripts/verify_market_catalog.py` (create in Task 9 uses these entries)

- [ ] **Step 1: Заполнить bootstrap entries из `MARKET_CASHBACK_ROWS`**

Ручной маппинг demo-названий → unified L2 (review against `supermarket_category_hierarchy.json`):

`backend/data/market_category_catalog.json`:

```json
{
  "magnit": {
    "кисломолочка": {
      "market_category": "Кисломолочка",
      "unified_subcategory": "Кефир, ряженка, простокваша",
      "unified_parent": "Молоко, сыр, яйца",
      "is_macro": false
    },
    "йогурты и десерты": {
      "market_category": "Йогурты и десерты",
      "unified_subcategory": "Йогурт",
      "unified_parent": "Молоко, сыр, яйца",
      "is_macro": false
    },
    "твёрдые сыры": {
      "market_category": "Твёрдые сыры",
      "unified_subcategory": "Сыр твёрдый",
      "unified_parent": "Молоко, сыр, яйца",
      "is_macro": false
    },
    "колбасы и купаты": {
      "market_category": "Колбасы и купаты",
      "unified_subcategory": "Сосиски и сардельки",
      "unified_parent": "Колбасные изделия",
      "is_macro": false
    }
  },
  "lenta": {
    "молоко и сливки": {
      "market_category": "Молоко и сливки",
      "unified_subcategory": "Молоко",
      "unified_parent": "Молоко, сыр, яйца",
      "is_macro": false
    },
    "мясо и птица": {
      "market_category": "Мясо и птица",
      "unified_subcategory": "Мясо и птица",
      "unified_parent": "Мясо и птица",
      "is_macro": true
    },
    "консервы": {
      "market_category": "Консервы",
      "unified_subcategory": "Овощные консервы",
      "unified_parent": "Консервация",
      "is_macro": false
    },
    "макароны": {
      "market_category": "Макароны",
      "unified_subcategory": "Макароны и паста",
      "unified_parent": "Макароны, крупы, масло, специи",
      "is_macro": false
    }
  },
  "pyaterochka": {
    "готовая кулинария": {
      "market_category": "Готовая кулинария",
      "unified_subcategory": "Комплексные обеды",
      "unified_parent": "Готовая еда",
      "is_macro": false
    },
    "пиво и сидр": {
      "market_category": "Пиво и сидр",
      "unified_subcategory": "Слабоалкогольные напитки и сидр",
      "unified_parent": "Алкогольные напитки",
      "is_macro": false
    },
    "замороженные ягоды": {
      "market_category": "Замороженные ягоды",
      "unified_subcategory": "Замороженные ягоды и фрукты",
      "unified_parent": "Замороженные продукты",
      "is_macro": false
    }
  }
}
```

**Важно:** перед commit проверить exact L2 names в `supermarket_category_hierarchy.json` — подправить unified_subcategory если embedding_text names differ (grep hierarchy file).

- [ ] **Step 2: Commit**

```bash
git add backend/data/market_category_catalog.json
git commit -m "feat: bootstrap market category catalog from demo rows"
```

---

### Task 9: Verify script (~25 min)

**Files:**
- Create: `scripts/verify_market_catalog.py`

- [ ] **Step 1: Создать verify script**

```python
#!/usr/bin/env python3
"""Verify market category catalog mapping cases."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from sentence_transformers import SentenceTransformer  # noqa: E402
from services.market_mapper_service import MarketMapperService  # noqa: E402

# source_name, source_slug, raw, expected_sub, expected_conf, expected_parent, expected_macro, expected_source
CASES = [
    ("Магнит", "magnit", "Кисломолочка", "Кефир, ряженка, простокваша", 1.0, "Молоко, сыр, яйца", False, "catalog"),
    ("Лента", "lenta", "Молоко и сливки", "Молоко", 1.0, "Молоко, сыр, яйца", False, "catalog"),
    ("Пятёрочка", "pyaterochka", "Пиво и сидр", "Слабоалкогольные напитки и сидр", 1.0, "Алкогольные напитки", False, "catalog"),
    ("Магнит", "magnit", "Молоко", "Молоко", None, "Молоко, сыр, яйца", False, None),  # embedding path
]


def main() -> int:
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    mapper = MarketMapperService()
    mapper.load(model=model)
    failed = 0

    for case in CASES:
        source_name, source_slug, raw, expected_sub, expected_conf, expected_parent, expected_macro, expected_source = case
        result = mapper.map_items(
            [CategoryMapRequestItem(raw_category=raw, rate=10.0)],
            source_name,
            source_slug,
        )[0]
        conf_ok = expected_conf is None or result.confidence == expected_conf
        source_ok = expected_source is None or result.match_source == expected_source
        ok = (
            result.unified_category == expected_sub
            and result.unified_parent == expected_parent
            and result.is_macro_category == expected_macro
            and conf_ok
            and source_ok
        )
        status = "PASS" if ok else "FAIL"
        print(f"{status}: {source_name} + {raw!r} -> {result.unified_category!r} ({result.match_source}, {result.confidence})")
        if not ok:
            print(f"       expected {expected_sub!r} / {expected_parent!r}")
            failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Adjust `expected_sub` for embedding case after first run if unified L2 name differs slightly.

- [ ] **Step 2: Run verify**

```bash
cd backend && .venv/bin/python ../scripts/verify_market_catalog.py
```

Expected: `All checks passed`

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_market_catalog.py
git commit -m "test: add market catalog verify script"
```

---

### Task 10: Auto-map script for parsed chain taxonomies (~45 min)

**Files:**
- Create: `scripts/auto_map_market_catalog.py`
- Create: `backend/data/parsed_market_taxonomies.json` (input, заполняется после парсинга)

- [ ] **Step 1: Определить input format для парсинга**

`backend/data/parsed_market_taxonomies.json`:

```json
{
  "magnit": [
    { "l1": "Молочные продукты", "l2": "Кисломолочка" },
    { "l1": "Молочные продукты", "l2": "Молоко" }
  ],
  "lenta": [],
  "pyaterochka": []
}
```

- [ ] **Step 2: Создать `scripts/auto_map_market_catalog.py`**

```python
#!/usr/bin/env python3
"""Auto-map parsed chain L2 names to unified taxonomy via embeddings."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from sentence_transformers import SentenceTransformer  # noqa: E402
from services.category_embedding import best_match, encode_texts  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PARSED_PATH = ROOT / "backend" / "data" / "parsed_market_taxonomies.json"
HIERARCHY_PATH = ROOT / "backend" / "data" / "supermarket_category_hierarchy.json"
CATALOG_PATH = ROOT / "backend" / "data" / "market_category_catalog.json"
REVIEW_THRESHOLD = 0.70


def _normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def main() -> None:
    parsed = json.loads(PARSED_PATH.read_text(encoding="utf-8"))
    hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

    subcategories: list[str] = hierarchy["subcategory_names"]
    sub_to_parent: dict[str, str] = hierarchy["subcategory_to_parent"]

    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    sub_embeddings = encode_texts(model, subcategories)

    needs_review: list[str] = []

    for market_slug, entries in parsed.items():
        catalog.setdefault(market_slug, {})
        for entry in entries:
            l2 = entry["l2"].strip()
            key = _normalize(l2)
            if key in catalog[market_slug]:
                continue
            query_emb = encode_texts(model, [l2])[0]
            idx, score = best_match(query_emb, sub_embeddings)
            unified_l2 = subcategories[idx]
            unified_l1 = sub_to_parent[_normalize(unified_l2)]
            catalog[market_slug][key] = {
                "market_category": l2,
                "unified_subcategory": unified_l2,
                "unified_parent": unified_l1,
                "is_macro": False,
                "_auto_map_score": round(float(score), 4),
            }
            if score < REVIEW_THRESHOLD:
                needs_review.append(f"{market_slug}: {l2!r} -> {unified_l2!r} ({score:.3f})")

    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {CATALOG_PATH}")
    if needs_review:
        print(f"\n{len(needs_review)} entries need manual review:")
        for line in needs_review:
            print(f"  {line}")
    else:
        print("All auto-mapped entries above review threshold")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Data-prep workflow (ручной, параллельно)**

1. Спарсить L1/L2 из приложений Магнит, Лента, Пятёрочка → заполнить `parsed_market_taxonomies.json`
2. `python3 scripts/auto_map_market_catalog.py`
3. Ревью low-confidence entries, правка unified в catalog
4. `python3 scripts/verify_market_catalog.py`

- [ ] **Step 4: Commit**

```bash
git add scripts/auto_map_market_catalog.py backend/data/parsed_market_taxonomies.json
git commit -m "feat: add auto-map script for parsed market taxonomies"
```

---

### Task 11: End-to-end verification (~20 min)

- [ ] **Step 1: Restart backend**

```bash
cd backend && .venv/bin/uvicorn main:app --reload --port 8000
```

Check: `curl -s http://localhost:8000/health | python3 -m json.tool`

Expected: `"bank_mapper_loaded": true, "market_mapper_loaded": true`

- [ ] **Step 2: Start frontend**

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev
```

- [ ] **Step 3: Manual e2e**

1. Empty screen → «Супермаркеты» → загрузить скриншот кэшbэка Магнита
2. Выбрать «Магнит» → processing → results
3. Проверить: строки матрицы = unified категории (не raw «Кисломолочка»)
4. Повторить для второго супермаркета — общие unified-строки должны совпадать

- [ ] **Step 4: Bank regression**

1. Empty screen → «Банки» → скриншот банка → results
2. Убедиться: банковский flow без изменений

- [ ] **Step 5: Update spec status**

В `docs/superpowers/specs/2026-06-18-supermarket-category-mapping-design.md` изменить `Status: Draft` → `Status: Approved`

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/specs/2026-06-18-supermarket-category-mapping-design.md
git commit -m "docs: mark supermarket category mapping spec approved"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Copy supermarket_catalog_tree.json | Task 1 |
| Generate hierarchy + enriched | Task 1 |
| MarketMapperService cascade | Task 4 |
| Per-market catalog architecture | Task 4, 8, 10 |
| kind in API endpoints | Task 5, 6 |
| Shared embeddings model | Task 3 |
| OCR prompt split | Task 6 |
| Frontend wiring | Task 7 |
| isUnreliableMapping for market | Task 7 |
| market_aliases + slug resolver | Task 2 |
| Seed catalog from parsing | Task 10 (data-prep) |
| verify script | Task 9 |
| E2E criteria | Task 11 |
| LLM fallback post-MVP | Not in plan (by design) |

## Out of Scope (post-MVP)

- LLM parent classifier for market
- Additional chains (Ашан, Перекрёсток)
- Auto-grow catalog from production fallback logs
