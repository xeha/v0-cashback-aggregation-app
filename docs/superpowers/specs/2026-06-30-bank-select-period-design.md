# bank-select: период кешбэка и даты файлов — Design Spec

**Date:** 2026-06-30  
**Status:** Shipped (`dev`, merge `c7263dc`)  
**Changelog:** [`2026-06-30-dev-integrations-changelog-design.md`](./2026-06-30-dev-integrations-changelog-design.md)  
**Mockup:** `canvases/bank-select-period-mockup.canvas.tsx`

## Problem

На экране выбора источника (`bank-select`) пользователь не видит:
1. За какой месяц относится кешбэк на скриншотах.
2. Когда файл скриншота был создан/изменён на устройстве.

Сейчас `results-screen` всегда показывает текущий календарный месяц (`getCurrentMonthYear()`), а `saveMatrix` пишет `period_month` / `period_year` из `new Date()` — без участия пользователя.

## Goals

- Пользователь **один раз за сессию** выбирает период кешбэка (месяц + год).
- Под каждой строкой скриншота показывается дата файла из `file.lastModified` (только для справки).
- Выбранный период отображается на `results-screen` и сохраняется в PocketBase при `saveMatrix`.

## Non-Goals

- OCR-извлечение месяца со скриншота.
- Разный период кешбэка для разных скриншотов в одной сессии.
- Редактирование даты файла пользователем.
- Изменение `period_month` / `period_year` при `updateSavedMatrix` (остаётся как при создании).

## Decisions (from brainstorming)

| Вопрос | Решение |
|--------|---------|
| Месяц кешбэка | Ручной выбор, **один на сессию** |
| Дефолт месяца | Текущий календарный месяц |
| Дата скриншота | `file.lastModified`, **на каждый файл** |
| UI layout | Вариант 1: селектор периода в шапке, «Файл от ДД.ММ.ГГГГ» под названием источника |

## Data Model

### `CashbackPeriod`

```ts
interface CashbackPeriod {
  month: number  // 1–12
  year: number
}
```

### `SourceSubmission` (extend)

```ts
fileModifiedAt?: string  // ISO 8601, from file.lastModified at pick time
```

### Session state (`CashbackApp`)

- `cashbackPeriod: CashbackPeriod` — дефолт `getDefaultCashbackPeriod()`, сброс при `handleRestart`.
- `fileModifiedBySrc: Record<string, number>` — маппинг `screenshotSrc` → `file.lastModified` (мс), пополняется при каждом pick.

### Persistence

- `saveMatrix` принимает `period: CashbackPeriod` вместо `now`.
- `hydrateFromSave` восстанавливает `cashbackPeriod` из `record.periodMonth` / `record.periodYear`.
- `fileModifiedAt` хранится в `submissions` JSON в PocketBase (backward-compatible optional field).

## UI — bank-select-screen

### Period block (новое)

Между подзаголовком и списком строк:

```
Кешбэк за
[ Июнь 2026 ▼ ]
```

- Native `<select>` со списком последних 12 месяцев (включая текущий), подпись «Июнь 2026».
- `onChange` → `onCashbackPeriodChange` в `CashbackApp`.
- При `lockedRowCount > 0` (add-more / replace) — селектор **disabled**, период сессии не меняется.

### Row metadata (новое)

Под полем источника (или под locked-именем):

```
Файл от 28.05.2026
```

- `text-[13px] text-slate-400`, не редактируется.
- Скрыто, если `fileModifiedAt` отсутствует (старые сохранения без поля).

## UI — results-screen

Заменить `getCurrentMonthYear()` на проп `cashbackPeriodLabel: string` из `formatCashbackPeriod(cashbackPeriod)`.

## File Pick Pipeline

### `ImagePickResult`

```ts
interface ImagePickResult {
  dataUrl: string
  fileModifiedAt: number  // file.lastModified, captured before HEIC conversion
}
```

`ImageFilePicker.onPick` принимает `ImagePickResult`.

### Consumers

| Место | Действие |
|-------|----------|
| `empty-screen` | Передаёт result в `CashbackApp`, регистрирует в `fileModifiedBySrc` |
| `gallery-screen` | При pick обновляет metadata; `onAdd` по-прежнему передаёт только `src` |
| `bank-select-screen` | При «Ещё кешбэк» регистрирует metadata локально + в parent |
| `cashback-app` global picker | Регистрирует metadata для upload-more / replace |

### `buildSubmission`

Добавляет `fileModifiedAt: new Date(ms).toISOString()` из локального массива или lookup по `screenshotSrc`.

## Error Handling

- `file.lastModified === 0` или отсутствует → не показывать строку «Файл от …».
- Старые `SourceSubmission` без `fileModifiedAt` → строка скрыта, OCR не затрагивается.

## Testing

Vitest для `lib/cashback-period.ts`:
- `getDefaultCashbackPeriod`
- `formatCashbackPeriod`
- `formatFileModifiedDate`
- `getCashbackPeriodOptions`

Ручная проверка:
- empty → gallery → bank-select: дата первого файла видна.
- «Ещё кешбэк»: у каждой строки своя дата.
- Смена периода → отражается на results.
- Сохранение → `period_month` / `period_year` соответствуют выбору.
- Открытие сохранения → период восстанавливается.

## Files Touched

| File | Change |
|------|--------|
| `lib/types.ts` | `CashbackPeriod`, `fileModifiedAt` |
| `lib/cashback-period.ts` | **new** — helpers |
| `lib/cashback-period.test.ts` | **new** |
| `components/image-file-picker.tsx` | `ImagePickResult` |
| `lib/bank-select-rows.ts` | `fileModifiedAt` in rows |
| `components/screens/bank-select-screen.tsx` | period selector + row dates |
| `components/cashback-app.tsx` | session state, wiring |
| `components/screens/empty-screen.tsx` | pick result type |
| `components/screens/gallery-screen.tsx` | pick result type |
| `components/screens/results-screen.tsx` | period label prop |
| `lib/saved-matrices.ts` | `period` in `saveMatrix` |
