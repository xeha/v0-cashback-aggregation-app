# Semantic Two-Stage Category Mapping — Design Spec

**Date:** 2026-06-17  
**Status:** Approved  
**Depends on:** [cashpack-taxonomy-design.md](./2026-06-17-cashpack-taxonomy-design.md), [bank-category-catalog-design.md](./2026-06-17-bank-category-catalog-design.md)  
**Scope:** Смысловое сопоставление банковских названий категорий с эталонным деревом CashPack (26 родителей + 108 leaves). Двухэтапный runtime-пайплайн + offline sync каталога. **Без UI.**

## Контекст

### Проблема

Банки называют категории кэшбэка своими словами. OCR возвращает эти названия как есть (`Активный отдых`, `Развлечения`, `Дом и ремонт`). Эталон — дерево CashPack из `categories.json` (26 родителей, 108 подкатегорий-листьев).

Текущий `MapperService` после catalog/synonyms делает **flat embedding по 108 leaves**. Это даёт системные ошибки:

| OCR / банк | Ожидание | Сейчас |
|------------|----------|--------|
| Альфа «Активный отдых» | родитель **Досуг И Отдых** (macro) | «Спорт И Активный Отдых» (слово «отдых» в названии родителя) |
| ГПБ subcategory «Авиа билеты» | leaf **Авиа билеты** / parent **Путешествия** | leaf верный, но `bank_category` в каталоге = «Супермаркеты» (ошибка offline sync) |
| OCR верхнего уровня «Развлечения» | macro **Досуг И Отдых** | принудительный leaf «Прочее (ДОСУГ и ОТДЫХ)» |

Корневая причина: **банковское название часто соответствует уровню родителя**, а pipeline всегда пытается найти leaf.

### Утверждённые решения (brainstorming 2026-06-17)

| Вопрос | Решение |
|--------|---------|
| Уровень маппинга | **C — двухэтапно:** сначала родитель по смыслу; leaf только при явном сигнале (exact leaf name, catalog entry с leaf, OCR subcategory) |
| Технология fallback | **C — гибрид:** catalog/synonyms → embedding по **26 enriched родителям** → LLM (Mistral) только при низком confidence embedding |

## Решение

### Архитектура runtime-маппинга

```
OCR raw_category + source_name (банк)
        │
        ▼
① Resolve bank → slug (bank_aliases.json)
        │
        ▼
② Exact match bank_category_catalog[slug]     confidence = 1.0, match_source = catalog
        │
        ▼
③ bank_named_categories (macro per bank)      confidence = 1.0, match_source = named
        │
        ▼
④ parent_category_synonyms (curated)          confidence = 1.0, match_source = parent
        │
        ▼
⑤ category_overrides (global leaf)            confidence = 1.0, match_source = override
        │
        ▼
⑥ Exact match leaf name в CashPack 108        confidence = 1.0, match_source = leaf_exact
        │
        ▼
⑦ Embedding → 26 enriched parents             confidence = cosine
   порог PARENT_THRESHOLD (default 0.55)
   → macro: unified_subcategory = unified_parent, is_macro_category = true
   match_source = parent_embedding
        │
        ▼ (только если parent найден на ⑦ и текст явно leaf внутри parent)
⑧ Embedding → leaves внутри parent            confidence = cosine
   порог LEAF_THRESHOLD (default 0.60)
   match_source = leaf_embedding
        │
        ▼ (только если ⑦ < PARENT_THRESHOLD и нет совпадений выше)
⑨ Mistral classify → 1 из 26 parents          match_source = llm_parent
        │
        ▼
⑩ Fallback: «Прочее (…») родителя «Услуги»    match_source = fallback
```

**Приоритеты не менять:** per-bank catalog > named > parent synonyms > global overrides > exact leaf > parent embedding > leaf-in-parent embedding > LLM > fallback.

### Когда назначается leaf vs macro

| Сигнал | Результат |
|--------|-----------|
| Catalog entry с `unified_subcategory` (не macro) | leaf + parent из каталога |
| Catalog entry с `is_macro: true` или `unified_subcategory == unified_parent` | macro parent |
| OCR-текст = exact leaf CashPack (normalized) | leaf |
| OCR-текст = exact parent CashPack (normalized) | macro parent |
| OCR-текст = банковское имя верхнего уровня, нет leaf-сигнала | macro parent (через ⑦ или ⑨) |
| Subcategory из scraped `cashback_offers.json` = exact leaf | leaf (offline sync) |
| Subcategory fuzzy, parent ясен | macro parent; leaf не угадывать |

**Правило:** если уверенность только в родителе — **не** назначать leaf «Прочее (…)» автоматически; показывать macro-строку родителя в матрице (`is_macro_category: true`).

### Пример: «Активный отдых» (Альфа-Банк)

```
OCR: "Активный отдых", bank: alfa-bank
        │
        ▼
② catalog["alfa-bank"]["активный отдых"] — нет записи
        │
        ▼
④ parent_synonyms["активный отдых"] → "Досуг И Отдых"   ← исправить (сейчас → "Спорт И Активный Отдых")
        │
        ▼
Result:
  unified_parent: "Досуг И Отдых"
  unified_subcategory: "Досуг И Отдых"
  unified_category: "Досуг И Отдых"
  is_macro_category: true
  match_source: "parent"
  confidence: 1.0
```

Если synonym отсутствует — шаг ⑦ enriched embedding отдаёт «Досуг И Отдых» выше «Спорт И Активный Отдых».

## Данные

### Новый файл: `backend/data/parent_category_enriched.json`

Генерируется скриптом из `category_hierarchy.json` + curated aliases. Не редактировать целиком вручную — точечные aliases в `parent_category_synonyms.json`.

```json
{
  "Досуг И Отдых": {
    "aliases": ["развлечения", "активный отдых", "хобби"],
    "embedding_text": "Досуг и отдых: кинотеатры, театры, концерты, парки аттракционов, хобби, спортивные мероприятия как зрелище",
    "fallback_leaf": "Прочее (ДОСУГ и ОТДЫХ)"
  },
  "Спорт И Активный Отдых": {
    "aliases": ["спорт", "фитнес", "спортивные товары"],
    "embedding_text": "Спорт и активный отдых: товары для спорта, фитнес, туризм, велосипеды, спортивная обувь и одежда",
    "fallback_leaf": "Товары для спорта"
  }
}
```

| Поле | Назначение |
|------|------------|
| `embedding_text` | Текст для sentence-transformers (имя + дети + disambiguation) |
| `aliases` | Дополнительные normalized ключи → попадают в `parent_category_synonyms` при sync |
| `fallback_leaf` | Leaf для шага ⑩, если parent определён, но macro недопустим |

**Disambiguation «Досуг» vs «Спорт И Активный Отдых»:** enriched-тексты явно разводят развлечения/аттракционы и спорттовары/фитнес. Curated alias `"активный отдых" → "Досуг И Отдых"` (контекст Альфы: popup описывает парки и клубы, не Decathlon).

### Изменения существующих файлов

| Файл | Изменение |
|------|-----------|
| `parent_category_synonyms.json` | `"активный отдых": "Досуг И Отдых"` (было `"Спорт И Активный Отдых"`) |
| `category_overrides.json` | Только exact leaf names CashPack; убрать макро-маппинги |
| `bank_category_catalog.json` | Перегенерировать двухэтапным sync; `unified: null` при низком confidence |
| `schemas.py` / `lib/types.ts` | Расширить `match_source` (см. ниже) |

### Новые значения `match_source`

```python
Literal[
    "catalog", "override", "parent", "named",
    "leaf_exact", "parent_embedding", "leaf_embedding",
    "llm_parent", "fallback",
    # deprecated, удалить после миграции:
    "embedding",
]
```

## Компоненты

### `MapperService` (изменения)

| Ответственность | Детали |
|-----------------|--------|
| Parent embeddings | При `load()`: encode 26 `embedding_text`, хранить `_parent_embeddings` |
| Leaf embeddings | Encode 108 leaves (как сейчас); использовать только на шаге ⑧ внутри parent |
| `_match_parent(raw)` | Каскад ②–⑦, ⑨; возвращает `(parent, confidence, match_source)` |
| `_match_leaf(raw, parent)` | Exact leaf → embedding среди children parent |
| `_mapped_item` | Macro: `unified_subcategory = unified_parent = parent`, `is_macro_category = true` |

Env:

| Переменная | Default | Назначение |
|------------|---------|------------|
| `CATEGORY_PARENT_THRESHOLD` | `0.55` | Минимальный cosine для parent embedding |
| `CATEGORY_LEAF_THRESHOLD` | `0.60` | Минимальный cosine для leaf внутри parent |
| `CATEGORY_LLM_FALLBACK` | `true` | Включить Mistral на шаге ⑨ |
| `SENTENCE_TRANSFORMER_MODEL` | `paraphrase-multilingual-MiniLM-L12-v2` | Без изменений |

### `CategoryClassifierService` (новый)

| Ответственность | Детали |
|-----------------|--------|
| `classify_parent(raw_category, bank_name)` | Mistral chat, structured JSON |
| Prompt | Список 26 родителей + OCR-текст + опционально bank |
| Response | `{"parent": "Досуг И Отдых", "confidence": 0.85}` |
| Валидация | `parent` must be in hierarchy; иначе fallback |
| Вызов | Только если parent embedding < `CATEGORY_PARENT_THRESHOLD` |
| Переиспользование | Тот же Mistral client / `MISTRAL_API_KEY`, что в `routers/ocr.py` |

**Leaf через LLM не назначается** — только parent на шаге ⑨.

### `scripts/sync_bank_catalog.py` (изменения)

Offline pipeline для каждой пары `(bank_slug, category_name, subcategories[])`:

```
1. Exact normalized match → CashPack leaf
2. Exact normalized match → CashPack parent (macro entry, is_macro: true)
3. parent_category_synonyms / overrides
4. Parent embedding (enriched) ≥ PARENT_THRESHOLD → macro
5. Leaf embedding только среди children найденного parent ≥ LEAF_THRESHOLD → leaf
6. Иначе unified_subcategory = null (review queue, не угадывать)
```

Это устраняет ошибки вида `bank_category: "Супермаркеты"` при `unified_subcategory: "Авиа билеты"`.

### `scripts/generate_parent_enriched.py` (новый)

- Input: `category_hierarchy.json`, optional manual disambiguation overrides
- Output: `parent_category_enriched.json`
- `embedding_text` = `{parent.name}: {comma-separated subcategory names}` + optional disambiguation suffix from override file

## Поток данных (end-to-end)

```
categories.json (CashPack)
    → category_hierarchy.json
    → parent_category_enriched.json
         ↓
cashback_offers.json + hierarchy + enriched
    → sync_bank_catalog.py
    → bank_category_catalog.json
         ↓
OCR screenshot → raw_category[]
    → POST /api/category/map (MapperService)
    → MappedItem[] → matrix (frontend)
```

## Обработка ошибок

| Ситуация | Поведение |
|----------|-----------|
| Parent embedding < threshold, LLM disabled/fails | `fallback` → «Прочее (УСЛУГИ)» / parent «Услуги» |
| LLM returns invalid parent | `fallback` |
| Catalog entry `unified: null` | Пропустить catalog; идти по каскаду embedding |
| Ambiguous parent (top-2 cosine diff < 0.05) | Prefer LLM if enabled; else macro parent с lower confidence + warning в logs |
| Bank slug unknown | Catalog skip; synonyms/global pipeline still runs |

Логировать: `raw_category`, `bank_slug`, `match_source`, `confidence`, `unified_parent` для каждого mapped item (backend stdout / structured log).

## Тестирование (ручное + скрипты)

### Обязательные кейсы

| Bank | raw_category | unified_parent | unified_subcategory | is_macro | match_source |
|------|--------------|----------------|---------------------|----------|--------------|
| Альфа-Банк | Активный отдых | Досуг И Отдых | Досуг И Отдых | true | parent |
| Альфа-Банк | Кинотеатры, театры, выставки | Досуг И Отдых | Кинотеатры, театры, выставки | false | catalog или leaf_exact |
| Газпромбанк | Кафе и рестораны | Кафе И Рестораны | Кафе И Рестораны | true | catalog |
| Газпромбанк | АЗС | Авто | Топливо | false | catalog |
| (unknown bank) | Яндекс Лавка | Продукты И Напитки | Доставка продуктов | false | parent_embedding + leaf или override |

### Скрипт верификации

Расширить `scripts/verify_bank_catalog.py`:

- Нет записей с `unified_subcategory` из другого parent, чем `bank_category` семантически
- Нет leaf-mapping для OCR-typical parent-only names без explicit leaf signal
- `активный отдых` → parent «Досуг И Отдых», не «Спорт И Активный Отдых»

## Вне scope

- UI-изменения (матрица уже поддерживает `is_macro_category`)
- PostgreSQL / persistence маппингов
- LLM для leaf classification
- Замена sentence-transformers на внешний embedding API

## Migration notes

1. Добавить `parent_category_enriched.json` + generator script
2. Исправить `parent_category_synonyms.json`
3. Refactor `MapperService` (parent-first cascade)
4. Add `CategoryClassifierService`
5. Update `sync_bank_catalog.py` (two-stage offline)
6. Regenerate `bank_category_catalog.json`
7. Extend `match_source` in backend + frontend types
8. Run verification script + manual OCR smoke test

## Связанные документы

- [2026-06-16-category-mapping-context-design.md](./2026-06-16-category-mapping-context-design.md) — контекст «Активный отдых» у Альфы
- [2026-06-17-cashpack-taxonomy-design.md](./2026-06-17-cashpack-taxonomy-design.md) — дерево 26+108, macro rows в матрице
