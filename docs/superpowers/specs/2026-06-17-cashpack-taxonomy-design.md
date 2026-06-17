# CashPack Taxonomy + Hierarchical Matrix — Design Spec

**Date:** 2026-06-17  
**Status:** Approved  
**Depends on:** [bank-category-catalog-design.md](./2026-06-17-bank-category-catalog-design.md)  
**Scope:** Заменить плоский `taxonomy.json` на двухуровневое дерево CashPack; маппинг OCR → подкатегория; матрица результатов — сводка по родителям + раскрытие деталей.

## Контекст

### Проблема плоской taxonomy

Текущий `taxonomy.json` (32 плоских строки) плохо покрывает язык банковских офферов:

- Подкатегории из scraped data (`Женская одежда`, `Авиа билеты`, `Доставка продуктов`) не совпадают с плоским списком
- Автоматический sync в `bank_category_catalog.json` даёт ошибки (`Авиа билеты` → `Супермаркеты`)
- Embedding по 32 категориям не различает близкие, но разные подкатегории

### Источник истины — CashPack

Файл: `/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/parsing_cat_subcat_hierarchy/categories.json`  
Источник: [cashpack.ru/offers](https://cashpack.ru/offers/)

| Метрика | Значение |
|---------|----------|
| Родительских категорий | 26 |
| Подкатегорий | 108 |
| Уровней | 2 (category → subcategory) |

Структура узла:

```json
{
  "id": 16,
  "name": "Продукты И Напитки",
  "subcategories": [
    { "id": 61, "name": "Доставка продуктов", "subcategories": [] }
  ]
}
```

Подкатегории совпадают с фильтрами CashPack и с `subcategories[]` в scraped `cashback_offers.json`.

### UX-решение (утверждено)

**Вариант C:** два режима отображения матрицы.

1. **По умолчанию — аккордеон:** строки = родители CashPack; тап раскрывает подкатегории
2. **Опционально — toggle «Все подкатегории»:** плоский список всех детей (для power users)

Макет: `canvases/cashpack-hierarchy-matrix.canvas.tsx`

## Решение

### Архитектура маппинга

```
OCR raw_category + source_name (банк)
        │
        ▼
① Resolve bank → slug (bank_aliases.json)
        │
        ▼
② Exact match в bank_category_catalog[slug]
        │  confidence = 1.0
        ▼
③ unified_subcategory (имя из CashPack leaf)
   unified_parent     (родитель CashPack)
        │
        ├─ найдено → return
        │
        └─ не найдено → ④ category_overrides (глобальные)
                        → ⑤ embedding → все 108 подкатегорий CashPack
                        → ⑥ «Прочее (УСЛУГИ)» или ближайший parent «Прочее»
```

Приоритеты **не менять:** catalog (per-bank) > global overrides > embedding.

### Данные

#### `backend/data/category_hierarchy.json`

Копия дерева CashPack в runtime-формате (генерируется скриптом из `categories.json`):

```json
{
  "source": "https://cashpack.ru/offers/",
  "parents": [
    {
      "id": 16,
      "name": "Продукты И Напитки",
      "subcategories": [
        { "id": 61, "name": "Доставка продуктов" },
        { "id": 60, "name": "Доставка готовой еды" }
      ]
    }
  ],
  "subcategory_to_parent": {
    "доставка продуктов": "Продукты И Напитки",
    "доставка готовой еды": "Продукты И Напитки"
  }
}
```

- Ключи `subcategory_to_parent` — `_normalize_category_name(name)`
- `taxonomy.json` **deprecated** после миграции; embedding и валидация unified идут по подкатегориям

#### Обновление `bank_category_catalog.json`

Поле `unified` переименовать семантически в **`unified_subcategory`** (имя leaf CashPack). Добавить **`unified_parent`** (родитель).

```json
{
  "sberbank-rossii": {
    "самокат": {
      "bank_category": "Самокат",
      "unified_subcategory": "Доставка продуктов",
      "unified_parent": "Продукты И Напитки",
      "match_level": "category"
    }
  }
}
```

Sync-скрипт (`sync_bank_catalog.py`):

1. Для `category_name` / `subcategory` из scraped data — exact match к leaf CashPack по нормализованному имени
2. Если exact — взять parent из `subcategory_to_parent`
3. Если нет exact — embedding к 108 leaves; parent из lookup
4. Банк-экосистемы (`Яндекс Лавка`, `Детский мир`) — ручные overrides в `bank_category_unified_overrides.json`, маппящие на ближайший CashPack leaf + parent

**Обратная совместимость API:** поле `unified_category` в ответе = `unified_subcategory` (не ломать фронт до миграции матрицы).

### Backend

#### `MapperService`

- Загружает `category_hierarchy.json` вместо плоского `taxonomy.json`
- Embedding-цели: все **108 подкатегорий** (строки leaf)
- После match — всегда вычисляет `unified_parent` через `subcategory_to_parent`
- Возвращает (расширение `MappedItem`):

```python
class MappedItem(BaseModel):
    raw_category: str
    unified_category: str          # = unified_subcategory (compat)
    unified_subcategory: str
    unified_parent: str
    rate: float
    confidence: float
    is_bank_offer: bool = False
    match_source: Literal["catalog", "override", "embedding", "fallback"] | None = None
```

#### Порог embedding

Оставить `CATEGORY_MAP_THRESHOLD` (default 0.45). При fallback ниже порога — leaf `Прочее (УСЛУГИ)` / parent `Услуги` (или отдельный catch-all leaf из CashPack).

### Frontend

#### Типы (`lib/types.ts`)

```typescript
export interface MappedItem {
  raw_category: string
  unified_category: string       // compat = subcategory
  unified_subcategory?: string
  unified_parent?: string
  rate: number
  confidence: number
  is_bank_offer?: boolean
}

export interface MatrixRow {
  category: string               // subcategory name (leaf)
  parent?: string                // CashPack parent; absent = flat legacy row
  bankRaw?: string               // optional: original OCR label for tooltip
  rates: Record<string, number>
}

export interface MatrixGroup {
  parent: string
  summaryRates: Record<string, number>  // max per provider across children
  rows: MatrixRow[]
}
```

#### `lib/matrix.ts`

- `mergeMappedItems()` сохраняет `parent` и `bankRaw` на каждой строке
- Новая функция `groupMatrixRows(rows): MatrixGroup[]` — группировка по `parent`
- `summaryRates[provider]` = `max(child.rates[provider])` по детям группы

#### `results-screen.tsx`

**Состояние:**

- `expandedParents: Set<string>` — какие группы раскрыты
- `showAllSubcategories: boolean` — глобальный toggle (default `false`)

**Рендер (default):**

```
┌ КАТЕГОРИЯ          [логотипы банков]
├ ▼ Продукты И Напитки     20%  5%  30%   ← summaryRates
│   Доставка продуктов     20%  5%   —
│     Сб: «Самокат»                         ← bankRaw, мелкий текст
│   Доставка готовой еды    —   —  30%
├ ▶ Путешествия             —  10%  10%
```

- Родительская строка — `button`, chevron + жирный текст
- Дети — отступ слева, обычный вес, подпись `банк: «raw»` если отличается от unified
- Цветовые tier-бейджи — на уровне той строки, которую видит пользователь (summary и child независимо)

**Рендер (`showAllSubcategories = true`):**

- Плоский список всех `MatrixRow` с подписью parent мелким текстом
- Без аккордеона; toggle обратно сворачивает

**Анимация:** `AnimatePresence` + height на раскрытии группы (как существующие переходы 0.35s).

### Специальные случаи

| Случай | Поведение |
|--------|-----------|
| Банк-экосистема (`is_bank_offer`) | По-прежнему исключается из матрицы сравнения |
| Один leaf, несколько банков | Нормальное сравнение в строке leaf |
| Один банк, несколько leaf в одном parent | Summary = max; дети видны при раскрытии |
| Parent без детей в данных | Строка parent не показывается |
| Legacy data без `unified_parent` | Fallback: `parent = unified_category`, без группировки |
| «Все покупки» | Отдельный leaf или parent-level row без детей |

### Миграция от `taxonomy.json`

| Старый unified | CashPack subcategory | Parent |
|----------------|---------------------|--------|
| Кафе, бары, рестораны | Рестораны (или leaf по контексту) | Кафе И Рестораны |
| АЗС и топливо | Топливо | Авто |
| Товары для детей | Товары для детей | Для Детей |
| Путешествия | Отели / Авиа билеты / … | Путешествия |
| Покупки в приложении банка | Прочее (ОНЛАЙН СЕРВИСЫ И ИГРЫ) | Онлайн Сервисы И Игры |

Таблица миграции — в `backend/data/taxonomy_migration.json` (ручной + пополняемый). Sync и overrides используют её при пересборке каталога.

## Связь со спеком bank-category-catalog

| Компонент | bank-category-catalog | Этот спек |
|-----------|----------------------|-----------|
| Bank slug resolve | ✓ без изменений | — |
| Catalog lookup | ✓ | unified → subcategory + parent |
| Sync script | ✓ | target = CashPack leaves |
| Embedding fallback | flat taxonomy | 108 leaves |
| UI | без изменений | аккордеон + toggle |

Спек 17.06 остаётся в силе для банк-специфичного lookup; этот спек меняет **целевую taxonomy** и **отображение матрицы**.

## Out of scope

- Третий уровень вложенности (только 2 уровня CashPack)
- Авто-обновление дерева с cashpack.ru (ручной re-import `categories.json`)
- Сравнение маркетплейсов по CashPack (отдельная итерация; структура та же)
- Fuzzy match OCR-опечаток
- PostgreSQL / persistence

## Файлы

| Файл | Действие |
|------|----------|
| `backend/data/category_hierarchy.json` | новый, из `categories.json` |
| `backend/data/taxonomy_migration.json` | новый, ручной |
| `backend/data/bank_category_catalog.json` | добавить `unified_parent`; `unified` → subcategory |
| `backend/data/taxonomy.json` | deprecated, удалить после миграции |
| `backend/services/mapper_service.py` | hierarchy load, parent lookup, extended MappedItem |
| `backend/schemas.py` | поля `unified_subcategory`, `unified_parent` |
| `scripts/sync_category_hierarchy.py` | новый: categories.json → category_hierarchy.json |
| `scripts/sync_bank_catalog.py` | target CashPack leaves |
| `lib/types.ts` | MatrixRow.parent, MappedItem fields |
| `lib/matrix.ts` | groupMatrixRows, summaryRates |
| `components/screens/results-screen.tsx` | аккордеон + toggle |
| `docs/superpowers/specs/2026-06-17-bank-category-catalog-design.md` | примечание о замене taxonomy |

## Тестирование

| Кейс | Вход | Ожидание |
|------|------|----------|
| Exact subcategory | `Доставка продуктов` | leaf + parent `Продукты И Напитки`, conf 1.0 |
| Bank catalog | Сбер + `Самокат` | leaf `Доставка продуктов` |
| Embedding | `Заправки` | leaf `Топливо`, parent `Авто` |
| Matrix group | 2 leaf в одном parent | summary = max по банку |
| Accordion | tap parent | children visible |
| Flat toggle | on | все leaf, parent в подписи |
| Legacy API | только `unified_category` | фронт не ломается |

Verify: расширить `scripts/verify_bank_catalog.py` кейсами parent/subcategory.

## Критерии успеха

1. ≥ 90% scraped subcategories маппятся на CashPack leaf с confidence 1.0 (через catalog) или ≥ 0.45 (embedding)
2. Ошибки вида `Авиа билеты` → `Супермаркеты` устранены после пересборки каталога
3. Матрица по умолчанию ≤ 10 parent-строк при типичном наборе из 3 банков
4. Раскрытие parent показывает bank raw + точный leaf
5. Toggle «Все подкатегории» работает без повторного OCR
