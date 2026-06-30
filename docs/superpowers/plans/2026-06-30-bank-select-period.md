# bank-select: период кешбэка и даты файлов — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На `bank-select` показать период кешбэка (один на сессию) и дату файла каждого скриншота; прокинуть период на results и в PocketBase.

**Architecture:** Новый `lib/cashback-period.ts` с форматтерами. `ImageFilePicker` возвращает `{ dataUrl, fileModifiedAt }`. `CashbackApp` хранит `cashbackPeriod` и `fileModifiedBySrc`. `BankSelectScreen` ренерит селектор и подписи строк. `saveMatrix` принимает явный период.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Tailwind v4

**Branch:** `feature/bank-select-period`  
**Worktree:** `.worktrees/bank-select-period`

**Spec:** `docs/superpowers/specs/2026-06-30-bank-select-period-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/types.ts` | `CashbackPeriod`, `ImagePickResult`, `fileModifiedAt` on `SourceSubmission` |
| `lib/cashback-period.ts` | Дефолт периода, форматирование, опции селектора |
| `lib/cashback-period.test.ts` | Unit-тесты helpers |
| `components/image-file-picker.tsx` | Захват `file.lastModified` до HEIC-конвертации |
| `lib/bank-select-rows.ts` | `fileModifiedAt` в `BankSelectInitialRow` |
| `components/screens/bank-select-screen.tsx` | UI селектора + подписи «Файл от …» |
| `components/cashback-app.tsx` | Session state, wiring всех экранов |
| `components/screens/empty-screen.tsx` | Тип `onFilePicked` |
| `components/screens/gallery-screen.tsx` | Регистрация metadata при pick |
| `components/screens/results-screen.tsx` | Проп `cashbackPeriodLabel` |
| `lib/saved-matrices.ts` | `period` в `saveMatrix` |

---

### Task 0: Worktree setup

- [ ] **Step 1:** Убедиться, что `.worktrees` в `.gitignore` (`git check-ignore -q .worktrees`)
- [ ] **Step 2:** Создать ветку и worktree от `dev`:

```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app
git fetch origin
git worktree add .worktrees/bank-select-period -b feature/bank-select-period dev
cd .worktrees/bank-select-period
npm install
```

- [ ] **Step 3:** Baseline:

```bash
npm run lint
npm run build
```

Expected: exit 0 (тестов на UI нет; `npm test` опционально).

---

### Task 1: Types and cashback-period helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/cashback-period.ts`
- Create: `lib/cashback-period.test.ts`

- [ ] **Step 1:** Добавить в `lib/types.ts`:

```ts
export interface CashbackPeriod {
  month: number
  year: number
}

export interface ImagePickResult {
  dataUrl: string
  fileModifiedAt: number
}
```

И поле `fileModifiedAt?: string` в `SourceSubmission`.

- [ ] **Step 2:** Создать `lib/cashback-period.ts`:

```ts
import type { CashbackPeriod } from "@/lib/types"

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const

export function getDefaultCashbackPeriod(now = new Date()): CashbackPeriod {
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export function formatCashbackPeriod(period: CashbackPeriod): string {
  const name = MONTH_NAMES[period.month - 1]
  return name ? `${name} ${period.year}` : `${period.month}.${period.year}`
}

export function formatFileModifiedDate(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}.${date.getFullYear()}`
}

export function periodToOptionValue(period: CashbackPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`
}

export function optionValueToPeriod(value: string): CashbackPeriod | null {
  const match = value.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { month, year }
}

export function getCashbackPeriodOptions(
  monthsBack = 11,
  now = new Date(),
): { value: string; label: string; period: CashbackPeriod }[] {
  const options: { value: string; label: string; period: CashbackPeriod }[] = []
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1)

  for (let i = 0; i <= monthsBack; i += 1) {
    const period = { month: cursor.getMonth() + 1, year: cursor.getFullYear() }
    options.push({
      value: periodToOptionValue(period),
      label: formatCashbackPeriod(period),
      period,
    })
    cursor.setMonth(cursor.getMonth() - 1)
  }

  return options
}

export function cashbackPeriodFromSaved(
  periodMonth?: number,
  periodYear?: number,
  fallback = getDefaultCashbackPeriod(),
): CashbackPeriod {
  if (periodMonth && periodMonth >= 1 && periodMonth <= 12 && periodYear) {
    return { month: periodMonth, year: periodYear }
  }
  return fallback
}
```

- [ ] **Step 3:** Создать `lib/cashback-period.test.ts` с тестами на `getDefaultCashbackPeriod`, `formatCashbackPeriod`, `formatFileModifiedDate`, `optionValueToPeriod`, `getCashbackPeriodOptions` (фиксированная дата через аргумент `now`).

- [ ] **Step 4:** Запустить:

```bash
npm test -- lib/cashback-period.test.ts
```

Expected: PASS

---

### Task 2: ImageFilePicker — file.lastModified

**Files:**
- Modify: `components/image-file-picker.tsx`

- [ ] **Step 1:** Импортировать `ImagePickResult` из `@/lib/types`.

- [ ] **Step 2:** Изменить сигнатуру:

```ts
onPick: (result: ImagePickResult) => void
```

- [ ] **Step 3:** В `handleChange` захватить `const fileModifiedAt = file.lastModified` **до** `readImageFile`, затем:

```ts
const dataUrl = await readImageFile(file)
onPick({ dataUrl, fileModifiedAt })
```

- [ ] **Step 4:** `npm run lint`

---

### Task 3: bank-select-rows — fileModifiedAt

**Files:**
- Modify: `lib/bank-select-rows.ts`

- [ ] **Step 1:** Добавить `fileModifiedAt?: string | null` в `BankSelectInitialRow`.

- [ ] **Step 2:** В `submissionToBankSelectRow` маппить `submission.fileModifiedAt ?? null`.

- [ ] **Step 3:** В `buildBankSelectRowState` вернуть `fileModifiedAts: (string | null)[]` параллельно `shots`.

---

### Task 4: BankSelectScreen UI

**Files:**
- Modify: `components/screens/bank-select-screen.tsx`

- [ ] **Step 1:** Новые пропсы:

```ts
cashbackPeriod: CashbackPeriod
onCashbackPeriodChange: (period: CashbackPeriod) => void
fileModifiedBySrc?: Record<string, number>
```

- [ ] **Step 2:** State `fileModifiedAts` из `buildBankSelectRowState`; при `handleScreenshotAdded(result: ImagePickResult)` пушить ISO-дату в массив и вызывать parent callback для регистрации в `fileModifiedBySrc` (опциональный проп `onScreenshotPicked?: (result: ImagePickResult) => void`).

- [ ] **Step 3:** При инициализации строк из `initialRows` / `initialShot` — резолвить дату: `row.fileModifiedAt` или `fileModifiedBySrc[screenshotSrc]`.

- [ ] **Step 4:** Рендер блока «Кешбэк за» + `<select>` из `getCashbackPeriodOptions()`. Disabled при `lockedRowCount > 0`.

- [ ] **Step 5:** Под каждой строкой:

```tsx
{fileDateLabel && (
  <p className="mt-1 px-1 text-[13px] text-slate-400">
    Файл от {fileDateLabel}
  </p>
)}
```

где `fileDateLabel = formatFileModifiedDate(ms)` или из ISO `fileModifiedAts[i]`.

- [ ] **Step 6:** В `buildSubmission` добавить `fileModifiedAt` при наличии.

- [ ] **Step 7:** Обновить `ImageFilePicker onPick` на новый тип.

---

### Task 5: CashbackApp wiring

**Files:**
- Modify: `components/cashback-app.tsx`
- Modify: `components/screens/empty-screen.tsx`
- Modify: `components/screens/gallery-screen.tsx`

- [ ] **Step 1:** В `resetState()` добавить `cashbackPeriod: getDefaultCashbackPeriod()` и `fileModifiedBySrc: {} as Record<string, number>`.

- [ ] **Step 2:** State + helper:

```ts
function registerFilePick(result: ImagePickResult) {
  setFileModifiedBySrc((prev) => ({
    ...prev,
    [result.dataUrl]: result.fileModifiedAt,
  }))
  return result.dataUrl
}
```

- [ ] **Step 3:** `empty-screen` — `onFilePicked: (result: ImagePickResult) => void`; в `CashbackApp`:

```ts
onFilePicked={(result) => {
  setActiveSaveId(null)
  const src = registerFilePick(result)
  setInitialShot(src)
  setGalleryPrefillSrc(src)
  setCurrentScreen("gallery")
}}
```

- [ ] **Step 4:** `gallery-screen` — `onPick` регистрирует metadata через проп `onScreenshotPicked?: (result: ImagePickResult) => void`.

- [ ] **Step 5:** `handleGlobalFilePicked(result)` — `registerFilePick` + существующая логика upload-more/replace.

- [ ] **Step 6:** `hydrateFromSave` — `setCashbackPeriod(cashbackPeriodFromSaved(record.periodMonth, record.periodYear))`.

- [ ] **Step 7:** `handleRestart` — сброс `cashbackPeriod` и `fileModifiedBySrc`.

- [ ] **Step 8:** Пропсы в `BankSelectScreen`:

```tsx
cashbackPeriod={cashbackPeriod}
onCashbackPeriodChange={setCashbackPeriod}
fileModifiedBySrc={fileModifiedBySrc}
onScreenshotPicked={registerFilePick}
```

- [ ] **Step 9:** При `onNext` с новой сессии (не add-more/replace) — период уже в state, submissions содержат `fileModifiedAt`.

---

### Task 6: Results + saveMatrix

**Files:**
- Modify: `components/screens/results-screen.tsx`
- Modify: `lib/saved-matrices.ts`
- Modify: `components/cashback-app.tsx` (handleSaveMatrix)

- [ ] **Step 1:** `ResultsScreen` — проп `cashbackPeriodLabel: string`; заменить `getCurrentMonthYear()` на него. Убрать неиспользуемый импорт `getCurrentMonthYear` если не нужен.

- [ ] **Step 2:** `CashbackApp` передаёт `cashbackPeriodLabel={formatCashbackPeriod(cashbackPeriod)}`.

- [ ] **Step 3:** `saveMatrix` payload:

```ts
export async function saveMatrix(
  pb: PocketBase,
  payload: {
    matrix: MatrixState
    submissions: SourceSubmission[]
    summary: ProcessingSummary
    title?: string
    period: CashbackPeriod
  },
) {
  const { month, year } = payload.period
  // ...
  period_month: month,
  period_year: year,
  title: payload.title ?? `Кешбэк ${month}.${year}`,
}
```

- [ ] **Step 4:** `handleSaveMatrix` передаёт `period: cashbackPeriod`.

---

### Task 7: Verify

- [ ] `npm test -- lib/cashback-period.test.ts`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Ручная проверка в worktree (`NEXT_PUBLIC_BACKEND_URL=... npm run dev`):
  - [ ] Селектор периода виден, дефолт — текущий месяц
  - [ ] «Файл от …» под каждой строкой
  - [ ] Период на results совпадает с выбором
  - [ ] add-more: селектор disabled, период не сбрасывается
  - [ ] Сохранение (если auth) — `period_month` / `period_year` в PB

- [ ] **Commit** (по запросу пользователя):

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: period selector and file dates on bank-select screen

EOF
)"
```

- [ ] Push feature branch, merge в `dev`, деплой development (по workflow проекта).

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Period selector, default current month | Task 1, 4, 5 |
| One period per session | Task 5 state |
| File date from lastModified | Task 2, 4, 5 |
| Results shows selected period | Task 6 |
| saveMatrix uses period | Task 6 |
| hydrateFromSave restores period | Task 5 |
| HEIC preserves lastModified | Task 2 (capture before convert) |
| Disabled selector on add-more | Task 4 |
| Vitest for helpers | Task 1 |
