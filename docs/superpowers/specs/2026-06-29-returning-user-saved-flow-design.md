# Returning User + Saved Results — Design Spec

**Date:** 2026-06-29  
**Status:** Approved (B + D)  
**Decisions:** Вариант **B** (empty + карточка «Продолжить») + **D** (список сохранений в «Кешбэк-профиль» в меню)

## Goal

Авторизованный пользователь, сохранивший результат, при повторном открытии приложения может быстро продолжить работу с последним сохранением или выбрать любое из списка в настройках. Редактирование — через существующий флоу «Загрузить ещё» с пересохранением в ту же запись PocketBase.

## Decisions

| Topic | Decision |
|-------|----------|
| Первый экран (auth + есть сохранения) | **B:** empty + карточка последнего сохранения сверху |
| Какое сохранение на карточке | Последнее по `updated` (fallback `created`) |
| Меню → Кешбэк-профиль | **D:** список всех сохранений + блок «Любимые категории» |
| Новая сборка | CTA «Выбрать скриншоты» на empty; в профиле — «+ Новая сборка» → сброс state → empty |
| Редактирование | Открыть сохранение → results → «Загрузить ещё» → bank-select → processing |
| Пересохранение после правок | **Update** той же записи, если открыта из PB (`activeSaveId`); иначе **create** |
| Гость | Карточки нет; «Кешбэк-профиль» в меню недоступен (как сейчас — только feedback/about) |
| Терминология UI | Не «матрица»; канон **кешбэк** (см. guest-first spec) |

## User flows

### Flow 1: Повторное открытие (вариант B)

```
[auth OK] → fetch saved_matrices
         → empty screen
              ├─ карточка «Кешбэк за июнь 2026» [Продолжить →]
              └─ «Выбрать скриншоты» (новая сборка)
[Продолжить] → hydrate state → results
```

### Flow 2: Список в меню (вариант D)

```
любой экран → ⚙ → Кешбэк-профиль
              ├─ Сохранённые результаты (список из PB)
              │     └─ тап → hydrate → results (меню закрывается)
              ├─ Любимые категории (чипы, как сейчас)
              └─ «+ Новая сборка» → handleRestart() → empty
```

### Flow 3: Редактирование сохранённого

```
results (activeSaveId set)
  → «Загрузить ещё»
  → bank-select (locked rows = текущие submissions)
  → processing (merge в existing matrix)
  → results
  → «Сохранить изменения» → PATCH saved_matrices
```

## UI

### Empty screen — карточка «Продолжить»

Показывать **только** если `user` есть и `latestSave !== null`.

**Расположение:** между шестерёнкой и иллюстрацией (full width, `px-6`).

**Содержимое карточки:**

| Элемент | Пример |
|---------|--------|
| Заголовок | `Кешбэк за июнь 2026` (из `title` записи) |
| Мета | `3 банка · 12 категорий · обновлено вчера` |
| CTA | Кнопка/зона «Продолжить →» (вся карточка кликабельна) |

**Стиль:** `border-yellow-300 bg-yellow-50`, как в макете `returning-user-saved-flow.html` (вариант B).

**Мета-строка:**

- «N банков» — число провайдеров в `bank_matrix.providers` + `market_matrix.providers` (уникальные имена)
- «M категорий» — сумма видимых строк в обеих матрицах (или max из bank/market row count — проще: `bank.rows.length + market.rows.length`)
- Дата — относительная на русском: «сегодня», «вчера», «3 дня назад», иначе `DD.MM.YYYY` по `updated`

**Loading:** пока идёт fetch — skeleton-карточка или ничего (не мигать). Предпочтение: короткий skeleton, чтобы не прыгал layout.

**Нет сохранений:** карточка не рендерится, empty как сейчас.

### UserMenu — вкладка «Кешбэк-профиль»

Только для авторизованных (`!isGuest`).

**Секция 1 — «Сохранённые результаты»**

- Список записей из PocketBase, сортировка `-updated`
- Карточка: `title`, мета (`N банков · M категорий`), опционально ★ если `is_favorite`
- Тап → `onOpenSaved(id)` → родитель загружает полную запись и переходит на results
- Пустой список: «Пока нет сохранений. Соберите кешбэки и нажмите «Сохранить результат» на экране итогов.»

**Секция 2 — «Любимые категории»**

- Текущие чипы из `CASHBACK_CATEGORIES` без изменений по UX
- Состояние по-прежнему локальное в `UserMenu` (persist в PB — out of scope)

**Секция 3 — CTA**

- «+ Новая сборка» — outline-кнопка внизу → `onNewAssembly()` → закрыть меню, `handleRestart()`, экран `empty`

### Results screen — сохранение

| Состояние | Текст кнопки | Действие |
|-----------|--------------|----------|
| `activeSaveId === null` | «Сохранить результат» | `create` в PB |
| `activeSaveId` set | «Сохранить изменения» | `update` записи по id |

После успешного update — toast «Изменения сохранены».

## Architecture

### State (`cashback-app.tsx`)

Новые поля:

```ts
activeSaveId: string | null          // id записи PB, если открыта из сохранения
savedSummaries: SavedMatrixSummary[] // для меню и карточки
savesLoading: boolean
```

При `handleRestart()` и `handleLogout()`: `activeSaveId = null`, summaries можно оставить (перезагрузятся при следующем fetch).

При `hydrateFromSave(record)`:

```ts
setActiveSaveId(record.id)
setMatrix({ bank: record.bank_matrix, market: record.market_matrix })
setSubmissions(record.submissions ?? [])
setProcessingSummary(record.summary ?? EMPTY_PROCESSING_SUMMARY)
setCurrentScreen("results")
```

### `lib/saved-matrices.ts`

Новые типы и функции:

```ts
export interface SavedMatrixSummary {
  id: string
  title: string
  periodMonth?: number
  periodYear?: number
  updated: string
  bankProviderCount: number
  marketProviderCount: number
  categoryCount: number
  isFavorite: boolean
}

export interface SavedMatrixRecord extends SavedMatrixSummary {
  bank_matrix: CashbackMatrix | null
  market_matrix: CashbackMatrix | null
  submissions: SourceSubmission[]
  summary: ProcessingSummary
}

listSavedMatrices(pb): Promise<SavedMatrixSummary[]>
getSavedMatrix(pb, id): Promise<SavedMatrixRecord>
updateSavedMatrix(pb, id, payload): Promise<void>
// saveMatrix — без изменений сигнатуры create
```

`listSavedMatrices`: `pb.collection("saved_matrices").getList(1, 50, { sort: "-updated", fields: "..." })` + вычисление counts на клиенте из JSON.

### Props threading

| Компонент | Новые props |
|-----------|-------------|
| `EmptyScreen` | `continueSave`, `onContinueSave`, `savesLoading` |
| `UserMenu` | `savedSummaries`, `onOpenSaved`, `onNewAssembly`, `savesLoading` |
| `ResultsScreen` | `activeSaveId` (для текста кнопки; save logic может остаться внутри через callback) |

Рекомендация: `onSaveMatrix` / `handleSave` поднять в `CashbackApp`, чтобы ветвление create/update было в одном месте.

### Fetch timing

```ts
useEffect(() => {
  if (!user) { setSavedSummaries([]); return }
  listSavedMatrices(pb).then(setSavedSummaries).catch(/* log, empty */)
}, [user])
```

После успешного create/update — refetch summaries (обновить карточку на empty и список в меню).

## Error handling

| Ситуация | Поведение |
|----------|-----------|
| PB недоступен при fetch списка | Карточка не показывается; в меню — «Не удалось загрузить список» + retry |
| Ошибка открытия одной записи | Toast «Не удалось открыть сохранение» |
| Ошибка update | Как сейчас `saveError` на results |
| Гость тапает «Продолжить» | N/A (карточки нет) |

## Out of scope

- Persist «Любимые категории» в PocketBase
- Удаление / переименование сохранений из UI
- `is_favorite` toggle в UI (поле есть в схеме, UI позже)
- Авто-открытие results без empty (вариант A)
- Отдельный экран «Мои кешбэки» как home (вариант C)
- Хранение скриншотов на сервере (submissions остаются data URL в JSON — как при create)

## Test plan (manual)

1. Гость открывает app → empty без карточки
2. Auth user без сохранений → empty без карточки
3. Сохранить результат → перезагрузить → карточка «Продолжить» с верными мета
4. «Продолжить» → results с теми же данными
5. «Загрузить ещё» → добавить скрин → «Сохранить изменения» → перезагрузить → те же изменения
6. Меню → Кешбэк-профиль → список всех сохранений → открыть другой месяц
7. «+ Новая сборка» из профиля → empty, state сброшен
8. «Выбрать скриншоты» на empty при наличии карточки → новый flow; старое сохранение в PB не трогается
9. Выйти → empty без карточки, summaries очищены

## Mockups

- `docs/superpowers/mockups/returning-user-saved-flow.html` — варианты A–D; реализуем **B** + **D**

## Related specs

- `2026-06-28-guest-first-screen-design.md` — гостевой empty, орфография кешбэк
- PocketBase collection `saved_matrices` — `scripts/setup_pocketbase.py`
