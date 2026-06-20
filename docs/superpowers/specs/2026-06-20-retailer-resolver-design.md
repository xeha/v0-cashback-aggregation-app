# Retailer Resolver — Design Doc
**Date:** 2026-06-20  
**Status:** Approved

## Problem

Bank cashback screenshots sometimes list specific retailer names (e.g., "Детский мир 7%", "Леонардо 5%") instead of generic category names. The current OCR→mapping pipeline does not have a dedicated retailer lookup — these names either match the existing bank_category_catalog (partial coverage) or fall through to embedding-based mapping with uncertain results. There is no mechanism to automatically discover and persist new retailer→category mappings.

## Goal

When a retailer name appears as a raw_category in a bank screenshot:
1. Map it to the correct unified parent category (e.g., "Детский мир" → "Для Детей")
2. Merge the result into the standard category row (no frontend changes)
3. For unknown retailers: auto-enrich the catalog in the background using Mistral web search
4. Persist new retailers to the catalog for future requests

## Approach: Instant Response + Background Enrichment

Zero latency overhead in the request path. The catalog grows automatically over time.

## Data

### `backend/data/retailer_catalog.json`

Central retailer lookup, initialized from `rf_retailers.json` (146 entries), auto-enriched at runtime.

```json
{
  "version": "1.0",
  "entries": {
    "детский мир": {
      "unified_parent": "Для Детей",
      "unified_subcategory": "Товары для детей",
      "canonical_name": "Детский мир",
      "source": "static"
    },
    "золотое яблоко": {
      "unified_parent": "Красота И Уход",
      "unified_subcategory": "Косметика и парфюмерия",
      "canonical_name": "Золотое яблоко",
      "source": "llm_web",
      "added_at": "2026-06-20T12:00:00Z"
    }
  }
}
```

Keys are normalized: lower-case, stripped, brackets/legal suffixes removed  
(`"Детский мир (ПАО)"` → `"детский мир"`).

### Section → unified_parent mapping (`rf_retailers.json` sections)

| rf_retailers section | unified_parent |
|---|---|
| FMCG — Продукты питания | Супермаркеты / Продукты |
| Fashion — Одежда | Одежда |
| БиКТ — Бытовая техника | Электроника |
| Детские товары и одежда | Для Детей |
| Косметика, парфюмерия | Красота И Уход |
| DIY & Household | Ремонт И Строительство |
| Аптеки и здоровье | Медицина И Здоровье |
| Спорт и активный отдых | Спорт |
| Обувь | Обувь |
| Зоотовары | Зоотовары |
| Ювелирные украшения | Ювелирные украшения |
| Универсальные маркетплейсы | Маркетплейсы |

## Request Pipeline

```
raw_category → normalize()
    ↓
retailer_catalog.lookup(normalized)
    ├── HIT  → override unified_parent + subcategory → return (instant)
    └── MISS → existing embedding-based mapping (current code)
               + if should_enrich(raw_category):
                   BackgroundTask: enrich_and_save(raw_category)
```

`should_enrich(name)` returns `True` when:
- name is NOT in `retailer_catalog`
- AND name does not directly match any taxonomy key
- AND embedding similarity score < 0.75 OR name looks like a proper noun (capitalized, not a common noun in taxonomy)

## Components

### New files

**`backend/services/retailer_resolver_service.py`**
- `normalize(name: str) → str` — lower-case, strip, remove legal suffixes / parentheses
- `lookup(name: str) → RetailerEntry | None` — exact match on normalized key
- `enrich_and_save(name: str) → None` — called as BackgroundTask:
  1. Calls `mistral-small-latest` with `web_search` tool
  2. Prompt: "Что за магазин {name}? К какой категории розничной торговли он относится в России? Выбери из списка: [unified_parent_list]. Ответь JSON: {unified_parent, unified_subcategory, canonical_name}"
  3. Parses response, validates `unified_parent` against allowed list
  4. Writes to `retailer_catalog.json` (thread-safe via file lock)

**`scripts/import_rf_retailers.py`**
- One-time import script: reads `rf_retailers.json`, maps sections to unified_parent using the table above, writes `retailer_catalog.json`

### Modified files

**`backend/services/mapper_service.py`**
- Add retailer pre-check step before the embedding loop
- Import `RetailerResolverService`, call `lookup()` first
- If HIT: skip embedding, use retailer entry directly
- If MISS: existing flow + return `should_enrich` flag

**`backend/routers/category.py`**
- Accept `BackgroundTasks` from FastAPI
- After `mapper.map_items()`, for items flagged `should_enrich=True`: `bg_tasks.add_task(retailer_resolver.enrich_and_save, item.raw_category)`

## Mistral Web Search Call

```python
response = client.chat.complete(
    model="mistral-small-latest",
    messages=[{"role": "user", "content": prompt}],
    tools=[{"type": "web_search"}],
    tool_choice="auto",
)
```

The response is parsed for JSON with `unified_parent` from the closed list. If parsing fails or confidence is low → skip write (do not pollute catalog with bad data).

## Error Handling

- Mistral API error in background → log warning, skip write (catalog unchanged)
- File lock timeout → log warning, skip write
- Unknown `unified_parent` in Mistral response → discard, do not write
- Catalog file missing on startup → create empty `{"version":"1.0","entries":{}}`

## Out of Scope (MVP)

- Frontend UI changes (retailer name shown as category, no label change)
- Human review / approval workflow for llm_web entries
- PostgreSQL or Redis (all storage in JSON files)
- Deduplication of enrichment tasks across concurrent requests (acceptable race condition: last-write-wins on same key)

## Sequence Diagram

```
User → POST /api/category/map
  → category.py router
    → mapper_service.map_items(items, source_name)
      → for each item:
          retailer_resolver.lookup(item.raw_category)
          ├── HIT → RetailerEntry → mapped_item (unified override)
          └── MISS → embedding_map() → mapped_item + should_enrich=True
    → return CategoryMapResponse
  → if any should_enrich: bg_tasks.add_task(enrich_and_save, name)
→ HTTP 200 (instant)

[Background]
enrich_and_save(name)
  → Mistral web search
  → parse JSON
  → write to retailer_catalog.json
  (next request with same name → catalog HIT)
```
