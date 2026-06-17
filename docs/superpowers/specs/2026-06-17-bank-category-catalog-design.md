# Bank Category Catalog — Design Spec

**Date:** 2026-06-17  
**Status:** Approved  
**Scope:** Снизить ошибки маппинга OCR → unified taxonomy за счёт банк-специфичного справочника категорий, сгенерированного из `cashback_offers.json`. **Без UI.** Embedding остаётся fallback.

## Контекст

### Проблема

Текущий `MapperService` маппит `raw_category` только через:

1. Глобальные overrides (`category_overrides.json`, 6 записей)
2. Cosine similarity к 30 unified-категориям (`taxonomy.json`)

`source_name` (банк) передаётся с фронта, но **не участвует** в выборе категории. Это даёт систематические ошибки:

- Одно название у разных банков означает разное («Активный отдых» у Альфы ≠ «Спорт и фитнес»)
- Банковские экосистемы («Яндекс Лавка», «СберЗдоровье») уезжают в ближайший embedding
- 66 из 86 уникальных `category_name` в спарсенных данных — банк-специфичны

### Внешний источник данных

Файл: `/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/sync_category_subcategory/cashback_offers.json`

| Метрика | Значение |
|---------|----------|
| Офферов | 127 |
| Банков | 15 |
| Уникальных `category_name` | 86 |
| Уникальных subcategories | 90 |
| Общих `category_name` у 2+ банков | 20 |

Структура записи:

```json
{
  "bank": "ОТП Банк",
  "category_name": "Одежда и обувь",
  "subcategories": ["Женская одежда", "Аксессуары", "..."],
  "description": "Кэшбэк на выбранную категорию..."
}
```

### Уточнение по OCR (подтверждено)

**Вариант A:** OCR в основном возвращает **верхний уровень** (`category_name`), не подкатегории.

Следствие: primary lookup — по `category_name`; `subcategories[]` — только fallback.

## Решение

### Двухступенчатый маппинг

```
OCR raw_category + source_name (банк)
        │
        ▼
① Resolve bank → catalog slug (logo-aliases + bank-catalog)
        │
        ▼
② Exact match в bank_category_catalog[slug]
   (сначала category_name, затем subcategories)
        │  confidence = 1.0
        ▼
③ unified из записи каталога
        │
        ├─ найдено → return
        │
        └─ не найдено → ④ category_overrides (глобальные)
                        → ⑤ embedding → taxonomy.json
                        → ⑥ «Прочее» (threshold)
```

### Почему два шага, а не один override

| Подход | Проблема |
|--------|----------|
| Глобальный override «Топливо» → unified | У Яндекс Лавки «Топливо» — subcategory экосистемы, у Газпромбанка — АЗС |
| Только embedding | Не различает банковский контекст |
| **(банк, текст) → bank_category → unified** | Контекст сохраняется; unified маппится один раз на ~86 имён |

## Данные

### `backend/data/bank_category_catalog.json`

Производный файл (не редактировать вручную целиком — генерировать скриптом, точечные правки — через overrides).

```json
{
  "sberbank-rossii": {
    "аптеки": {
      "bank_category": "Аптеки",
      "unified": "Аптеки",
      "match_level": "category"
    },
    "выбираемые категории": {
      "bank_category": "Аптеки",
      "unified": "Аптеки",
      "match_level": "subcategory"
    }
  },
  "yandex-bank": {
    "яндекс лавка": {
      "bank_category": "Яндекс Лавка",
      "unified": "Покупки в приложении банка",
      "match_level": "category"
    }
  },
  "alfa-bank": {
    "активный отдых": {
      "bank_category": "Активный отдых",
      "unified": "Развлечения",
      "match_level": "category"
    }
  }
}
```

**Ключ верхнего уровня:** slug из `lib/data/bank-catalog.json`.  
**Ключ записи:** `_normalize_category_name(raw)` — lowercase, сжатые пробелы (как в `mapper_service`).  
**`match_level`:** `"category"` | `"subcategory"` — для отладки; на логику не влияет.  
**`unified`:** одна из строк `taxonomy.json` или явный override.

### `backend/data/bank_category_unified_overrides.json`

Ручные правки unified-маппинга, которые скрипт не может вывести автоматически:

```json
{
  "активный отдых": "Развлечения",
  "азс": "АЗС и топливо",
  "яндекс лавка": "Покупки в приложении банка",
  "сберздоровье": "Медицина"
}
```

Скрипт синхронизации применяет overrides **после** автоматического сопоставления с taxonomy.

### Алиасы банков

Использовать существующий `lib/data/logo-aliases.json` + `bank-catalog.json` (`name` → `slug`).

Дополнить `logo-aliases.json` для имён из scraped data:

| Scraped `bank` | Catalog slug |
|----------------|--------------|
| Сбербанк | `sberbank-rossii` |
| Райффайзенбанк | `rajffajzenbank` |
| ОТП Банк | `otp-bank` |
| Озон Банк | `ozon-bank` |
| МТС Банк | `mts-bank` |
| Московский Кредитный Банк | `moskovskij-kreditnyj-bank` |
| Русский стандарт | `russkij-standart` |
| Совкомбанк | `sovkombank` |
| Кредит Европа Банк | `kredit-evropa-bank` |
| УБРиР | *(добавить в `bank-catalog.json` или отдельный alias-файл на backend)* |

**Lookup `source_name` → slug:**

1. `_normalize(source_name)` → `logo-aliases.json["bank"]`
2. Иначе exact match по `bank-catalog.json[].name` (case-insensitive)
3. Иначе slug не найден → пропустить шаги ②–③, перейти к embedding

Backend загружает копию alias-логики (не HTTP к frontend). Допустимо вынести общий JSON в `backend/data/bank_aliases.json`, сгенерированный из `logo-aliases.json` + catalog names.

### Автоматическое сопоставление unified (в скрипте sync)

Для каждого `category_name` из scraped data:

1. Exact match с `taxonomy.json` → взять как `unified`
2. Иначе lookup в `bank_category_unified_overrides.json` по нормализованному имени
3. Иначе пометить `unified: null` — при runtime шаг ③ не срабатывает, fallback на embedding по **оригинальному** `raw_category`

Записи с `unified: null` после sync выводить в stderr для ручного дополнения overrides.

### Связь со спеком 2026-06-16

Спек [category-mapping-context-design.md](./2026-06-16-category-mapping-context-design.md) планировал ручной `bank_category_definitions.json` для **описаний**. В этой итерации:

- **Маппинг** — через `bank_category_catalog.json` (этот спек)
- **Описания** — опционально: поле `description` из scraped data можно положить в каталог как `bank_description` (отложено; не блокирует маппинг)
- `category_overrides.json`: `"активный отдых": "Спорт и фитнес"` → исправить на `"Развлечения"` (как в спеке 16.06); после внедрения каталога глобальные overrides — только для банков **без** slug

## Backend

### `MapperService.map_items()` — новая логика

```python
def map_items(self, items, source_name=None) -> list[MappedItem]:
    bank_slug = resolve_bank_slug(source_name) if source_name else None

    for item in items:
        normalized = _normalize_category_name(item.raw_category)

        # ② catalog lookup (bank-aware)
        if bank_slug:
            entry = self._catalog.get(bank_slug, {}).get(normalized)
            if entry and entry["unified"]:
                yield MappedItem(..., unified_category=entry["unified"], confidence=1.0)
                continue

        # ④ global overrides (existing)
        ...

        # ⑤ embedding (existing)
        ...
```

Порядок приоритетов **не менять**: catalog (per-bank) > global overrides > embedding.

### `scripts/sync_bank_catalog.py`

Вход: путь к `cashback_offers.json` (аргумент CLI, default — путь из sync-проекта).  
Выход: `backend/data/bank_category_catalog.json`.

Шаги:

1. Загрузить `cashback_offers.json`, `taxonomy.json`, `bank_category_unified_overrides.json`, bank aliases
2. Для каждой записи: resolve `bank` → slug; пропустить если slug не найден (warn)
3. Добавить ключ для `category_name` (`match_level: category`)
4. Добавить ключи для каждого `subcategory` (`match_level: subcategory`); если subcategory дублирует category_name — одна запись
5. Вычислить `unified` (auto + overrides)
6. Записать JSON (отсортированные ключи для стабильного diff)

Запуск вручную после обновления scraped data; в CI не обязателен на MVP.

## API

**Без breaking changes.** `POST /api/category/map` — те же поля.

Опционально (nice-to-have, не блокер):

```python
match_source: Literal["catalog", "override", "embedding", "fallback"] | None = None
```

Полезно для отладки и `lowConfidence` на фронте. Frontend может игнорировать.

## Frontend

**Без изменений.** `mapCategories(ocr.items, submission.providerName)` уже передаёт `source_name`.

## Тестирование

| Кейс | `source_name` | `raw_category` | Ожидание |
|------|---------------|----------------|----------|
| Точное совпадение | `Сбер` | `Аптеки` | `Аптеки`, confidence 1.0 |
| Банк-экосистема | `Яндекс Банк` | `Яндекс Лавка` | `Покупки в приложении банка` |
| Альфа активный отдых | `Альфа-Банк` | `Активный отдых` | `Развлечения` |
| Shared категория | `ОТП Банк` | `АЗС` | `АЗС и топливо` |
| Банк без каталога (ПСБ) | `ПСБ` | `Супермаркеты` | embedding (как сейчас) |
| Неизвестная категория | `ВТБ` | `Несуществующая` | embedding → threshold / «Прочее» |
| Subcategory fallback | `ОТП Банк` | `Женская одежда` | `Одежда и обувь` (если OCR вернёт sub) |

Verify-скрипт `scripts/verify_bank_catalog.py`: прогон таблицы кейсов против `MapperService` без HTTP.

## Out of scope

- UI подсказок (ⓘ, bottom sheet)
- Автоматический cron sync / деплой scraped JSON
- Fuzzy match OCR-опечаток
- Per-bank **разные** unified для одного `category_name` у разных банков (если «АЗС» везде → одна unified; экосистемы — через bank-specific ключ)
- Замена `taxonomy.json` или отказ от embedding
- Добавление PostgreSQL

## Файлы

| Файл | Действие |
|------|----------|
| `backend/data/bank_category_catalog.json` | новый, генерируемый |
| `backend/data/bank_category_unified_overrides.json` | новый, ручной + пополняемый |
| `backend/data/bank_aliases.json` | новый, генерируемый из `logo-aliases.json` + catalog |
| `backend/services/mapper_service.py` | catalog lookup, load catalog |
| `scripts/sync_bank_catalog.py` | новый |
| `scripts/verify_bank_catalog.py` | новый |
| `lib/data/logo-aliases.json` | дополнить алиасы scraped-банков |
| `backend/data/category_overrides.json` | исправить `активный отдых` → `Развлечения` |
| `docs/superpowers/specs/2026-06-16-category-mapping-context-design.md` | примечание: маппинг покрывается этим спеком |

## Критерии успеха

1. Для 15 банков из scraped data ≥ 90% типичных `category_name` с OCR маппятся с confidence 1.0 через catalog
2. Кейс «Активный отдых» / «Яндекс Лавка» / «АЗС» — корректные unified без embedding
3. Банки вне каталога — поведение не хуже текущего (embedding fallback)
4. Обновление каталога — одна команда `python scripts/sync_bank_catalog.py <path>`
