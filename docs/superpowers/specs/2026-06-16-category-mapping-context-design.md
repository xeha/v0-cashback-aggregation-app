# Category Mapping & Bank Definitions — Design Spec

**Date:** 2026-06-16  
**Status:** Approved  
**Scope:** Исправить маппинг «Активный отдых»; курируемый справочник расшифровок per-bank на backend. **Без UI** (иконка ⓘ у строки матрицы не реализуется).

## Проблема

Скриншот Альфа-Банка содержит категорию **«Активный отдых»**. В popup «i» банк описывает её как спортивные клубы, парки аттракционов и прочий досуг — шире, чем «Спорт и фитнес».

Текущий override в `category_overrides.json` ошибочно маппит:

```json
"активный отдых": "Спорт и фитнес"
```

Это было добавлено в спеке bank-services-exclusion и даёт неверную строку в матрице сравнения.

## Решение

| Слой | Изменение |
|------|-----------|
| `category_overrides.json` | `"активный отдых"` → **«Развлечения»** |
| `bank_category_definitions.json` | Ручные расшифровки `(bank_slug, raw_category) → description` |
| `MapperService` | Lookup описания по `source_name` + `raw_category`; отдавать в API |
| Frontend | **Без изменений** — описания не показываются в этой итерации |

### Почему «Развлечения», а не «Спорт и фитнес»

Определение Альфы включает парки аттракционов и «места для отдыха и развлечений» — это ближе к unified-категории **«Развлечения»**. Спортклубы частично пересекаются, но узкий «Спорт и фитнес» не отражает полноту категории банка.

Для сравнения между банками (вариант A) «Активный отдых» у Альфы и «Развлечения» у других банков попадают в одну строку матрицы.

## Данные

### Override (исправление)

`backend/data/category_overrides.json`:

```json
{
  "активный отдых": "Развлечения"
}
```

Остальные overrides без изменений.

### Bank category definitions (новый файл)

`backend/data/bank_category_definitions.json`:

```json
{
  "alfa-bank": {
    "активный отдых": "Спортивные клубы, парки аттракционов и другие места для отдыха и развлечений"
  }
}
```

**Ключ банка:** slug из `lib/data/bank-catalog.json` (`alfa-bank`, `t-bank`, …).  
**Ключ категории:** нормализованный `raw_category` (lowercase, сжатые пробелы) — как в `mapper_service._normalize_category_name`.

**Lookup при маппинге:**

1. Если `source_name` резолвится в catalog slug — использовать slug.
2. Иначе — нормализованное `source_name` как fallback-ключ.
3. Если описание не найдено — поле не возвращается (не ошибка).

Справочник пополняется вручную (~10–20 записей по мере тестирования скриншотов). Автопарсинг popup «i» и сайтов банков — out of scope.

## API

Расширить `MappedItem` (backend `schemas.py` + frontend `lib/types.ts`):

```python
bank_description: str | None = None  # только если есть в bank_category_definitions.json
```

`POST /api/category/map` — поведение маппинга не меняется; добавляется опциональное поле в ответе. Frontend может игнорировать до появления UI.

## Frontend / матрица

**Не в scope:**

- Иконка ⓘ у строки катрицы
- Bottom sheet / tooltip с расшифровками
- `MatrixCellMeta`, `labels` в `MatrixRow`
- `lib/category-descriptions.ts`

Матрица по-прежнему показывает только unified-категорию и проценты. `raw_category` по-прежнему доступен в `ProcessingSummary.lowConfidence` для предупреждений о низкой уверенности.

## Тестирование

| Кейс | Ожидание |
|------|----------|
| OCR «Активный отдых» + map с `source_name: "Альфа-Банк"` | `unified_category: "Развлечения"`, `bank_description` с текстом из справочника |
| OCR «Фитнес» | `unified_category: "Спорт и фитнес"` (embedding или будущий override) |
| Банк без записи в definitions | `bank_description: null` |
| Супермаркеты | без изменений |

Verify-скрипт или unit-тест на lookup описания по slug (mirror Python logic в `scripts/`).

## Out of scope (следующие итерации)

- UI подсказок (ⓘ, inline subtitle, bottom sheet)
- OCR второго скриншота с popup «i»
- Per-bank разные unified-маппинги для одного `raw_category`
- `taxonomy_descriptions.json` (общие описания unified-категорий без UI не нужны)

## Файлы

| Файл | Действие |
|------|----------|
| `backend/data/category_overrides.json` | `активный отдых` → Развлечения |
| `backend/data/bank_category_definitions.json` | новый |
| `backend/services/mapper_service.py` | load definitions, lookup, attach `bank_description` |
| `backend/schemas.py` | `bank_description` на `MappedItem` |
| `lib/types.ts` | `bank_description?` на `MappedItem` |
| `docs/superpowers/specs/2026-06-16-bank-services-exclusion-design.md` | примечание: override «активный отдых» исправлен отдельным спеком |
