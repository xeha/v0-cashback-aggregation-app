# Dev integrations — changelog & design summary (2026-06-30)

**Date:** 2026-06-30  
**Status:** Shipped on `dev` (not on `main`)  
**Branch:** `dev` → Dokploy **development** (`dev.cashbackbrain.ru`)

Сводный документ по изменениям, влитым в `dev` за 30 июня 2026. Детальные спеки по отдельным фичам — в связанных файлах ниже.

---

## 1. Thin client pipeline (архитектурный сдвиг)

**Коммиты:** `d7d5aca`, `da6fb68`, `24d6aa2`

### Было

- Frontend сам вызывал `POST /api/ocr/extract` и `POST /api/category/map` по каждому скриншоту.
- Слияние матрицы и группировка категорий — в `lib/matrix.ts` на клиенте.

### Стало

- **Единственный путь OCR** — серверный pipeline (`backend/services/pipeline_service.py`).
- **`POST /api/pipeline/batch`** — пакетная обработка нескольких скриншотов за один запрос; частичные ошибки возвращаются в теле ответа.
- **Группы матрицы** считаются на сервере (`matrix_group_service.py`, `market_comparison_service.py`) и приходят в ответе pipeline.
- **Processing screen** упрощён: по умолчанию один batch-запрос; legacy поштучный цикл — через `NEXT_PUBLIC_USE_BATCH=0`.
- Клиентский merge-path удалён из `lib/api.ts` / `lib/matrix.ts` (тонкий клиент).

### Файлы

| Слой | Ключевые файлы |
|------|----------------|
| API | `backend/routers/pipeline.py`, `backend/schemas.py` |
| Сервисы | `backend/services/pipeline_service.py`, `matrix_group_service.py`, `market_comparison_service.py` |
| Frontend | `components/screens/processing-screen.tsx`, `lib/api.ts`, `lib/matrix-api.ts` |
| Тесты | `backend/tests/test_batch_pipeline.py`, `test_matrix_group_display.py`, `test_market_comparison.py` |

### Заметки

- Для **сохранённых матриц** из PocketBase клиент по-прежнему может собирать группы локально (fallback).
- `lib/matrix.ts` оставлен с UI-хелперами; domain merge — только на backend.

---

## 2. Период кешбэка и даты файлов (bank-select)

**Коммиты:** `de9ff9a`, merge `c7263dc`  
**Детальная спека:** [`2026-06-30-bank-select-period-design.md`](./2026-06-30-bank-select-period-design.md)  
**План:** [`../plans/2026-06-30-bank-select-period.md`](../plans/2026-06-30-bank-select-period.md)

### Shipped

- Селектор **«Кешбэк за»** на `bank-select-screen` (12 месяцев, один период на сессию).
- Подпись **«Файл от ДД.ММ.ГГГГ»** из `file.lastModified` при выборе скриншота.
- Период на `results-screen` (`cashbackPeriodLabel`) вместо текущего календарного месяца.
- `saveMatrix` пишет `period_month` / `period_year` из выбора пользователя.
- `hydrateFromSave` восстанавливает период из сохранения.
- Unit-тесты: `lib/cashback-period.test.ts` (20 тестов).

### Модель

```ts
interface CashbackPeriod { month: number; year: number }  // 1–12
interface ImagePickResult { dataUrl: string; fileModifiedAt: number }
// SourceSubmission.fileModifiedAt?: string  // ISO, optional
```

---

## 3. PWA — «На экран Домой»

**Коммит:** `11cfd2e` (+ hardening `3a6c76d` для `sw.js`)

### Shipped

- `public/manifest.json` — PNG 192/512, maskable icon, `display: standalone`.
- `public/sw.js` + регистрация в `components/pwa-registrar.tsx`.
- Кнопка на results: **«На экран „Домой“»** вместо «Добавить виджет».
- **Android / Chrome desktop:** системный диалог установки (`beforeinstallprompt`).
- **iOS Safari:** пошаговая инструкция (авто-ярлык невозможен).

### Не в scope / не shipped

- **«Сохранить PNG»** и **«Поделиться»** на results — по-прежнему UI-заглушки (`results-overlays.tsx`), без реального экспорта/шаринга.
- Живые **виджеты iOS/Android** — не поддерживаются вебом.

### Security (после PWA)

- Service worker **не перехватывает** cross-origin запросы (API с base64 не попадает в SW).

---

## 4. Сохранённые сборки (UX + meta)

**Коммиты:** `1d68231`, `6713b5e`, `529ee56`, `7b2418f`

| Изменение | Описание |
|-----------|----------|
| Meta в списке сохранений | Банки и супермаркеты считаются **раздельно** (`lib/saved-matrix-meta.ts`) |
| Предупреждение о новой сессии | Диалог при «Выбрать скриншоты», если у пользователя уже есть сохранения (`reset-session-confirm-dialog.tsx`) |
| Удаление сохранения | Кнопка удалить в user menu + confirm; `deleteSavedMatrix` в PocketBase |
| UI | Отступ у карточки «продолжить сохранение», чтобы не перекрывать кнопку настроек |

---

## 5. Security hardening

**Коммит:** `3a6c76d`

- **Pydantic:** `max_length=20_000_000` на поля `image_base64` — отказ до декодирования Pillow.
- **Rate limiter:** IP берётся из прямого соединения, без доверия к `X-Forwarded-For`.
- **Service worker:** см. §3.

---

## 6. Деплой и инфраструктура VPS

**Коммиты:** `5ce85dd`, `645adce`, `1672c8a`, `c2da8bf`

### Dev stack on-demand

**Спека:** [`2026-06-29-dev-stack-memory-design.md`](./2026-06-29-dev-stack-memory-design.md)

- `scripts/toggle_dev_stack.py` — start/stop/status development-стека в Dokploy.
- VPS Timeweb **8 GiB RAM**; dev поднимается только на время теста.
- `scripts/timeweb_server_status.py` — статус сервера и бэкапы диска.

### Smart deploy

- `scripts/deploy_environment_dokploy.py` — **авто-определение** сервисов по `git diff` (`frontend` / `fastapi` / `pocketbase`).
- Override: `--services`, `--base-ref`.

### FastAPI Docker

- **CPU-only torch** в `backend/Dockerfile` — без CUDA-колёс (~1.5 GB экономии на образе и RAM при старте).
- Мотивация: на 8 GiB VPS одновременный prod + dev FastAPI с ML легко даёт **502 / OOM** на `api-dev`.

### Известная эксплуатационная проблема

| Симптом | Причина | Обход |
|---------|---------|--------|
| `api-dev` → 502, фронт: «Сервер недоступен» | Prod FastAPI + dev FastAPI оба грузят ML-модель | Временно остановить prod FastAPI в Dokploy **или** не поднимать dev FastAPI параллельно с prod; после CPU-torch пересобрать dev FastAPI |
| Долгая пересборка FastAPI | Первая сборка скачивает torch + sentence-transformers | 10–25 мин; smart deploy не трогает fastapi, если `backend/` не менялся |

---

## 7. Прочие fix

| Коммит | Суть |
|--------|------|
| `c020681` | Порядок классов `LowConfidenceItem` / `BankOfferItem` в `backend/schemas.py` (forward reference) |

---

## 8. Индекс коммитов (30.06.2026, `dev`)

| Hash | Тема |
|------|------|
| `529ee56` | UX: удаление сохранённых сборок |
| `7b2418f` | UI: отступ save card |
| `6713b5e` | UX: confirm перед новой сессией |
| `6a8bc37` | merge smart-deploy |
| `1672c8a` | deploy: git diff → сервисы |
| `5ebde85` | merge security-hardening |
| `3a6c76d` | security: base64 limit, rate IP, SW scope |
| `c020681` | fix backend schemas order |
| `c2da8bf` | fix: CPU-only torch в Docker |
| `c7263dc` | merge bank-select-period |
| `de9ff9a` | feat: период кешбэка + даты файлов |
| `11cfd2e` | feat: PWA / на экран Домой |
| `1d68231` | fix: meta банки/супермаркеты в сохранениях |
| `24d6aa2` | feat: pipeline batch endpoint |
| `da6fb68` | feat: группы матрицы на сервере |
| `d7d5aca` | refactor: убран client-side merge |
| `645adce` | ops: Timeweb VPS status script |
| `5ce85dd` | ops: toggle dev stack |

---

## 9. Проверка на dev

```bash
# Стек
python3 scripts/toggle_dev_stack.py start --wait-health

# Деплой (только изменённые сервисы)
DOKPLOY_TARGET=development python3 scripts/deploy_environment_dokploy.py

# E2E (при необходимости)
FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py
```

**Ручной чеклист после деплоя:**

1. Загрузка скриншотов → batch processing → results с серверными группами.
2. Bank-select: период + «Файл от …» → период на results → сохранение в PocketBase.
3. User menu: открыть / удалить сохранение; confirm при новой сессии.
4. PWA: «На экран Домой» на Android Chrome.
5. `https://api-dev.cashbackbrain.ru/health` → `{"status":"ok",...}`.

---

## 10. Следующие шаги (не в этом релизе)

- [ ] Реализовать **Сохранить PNG** + **Поделиться** на results (Web Share API, `html-to-image`).
- [ ] Стабилизировать **одновременный** prod + dev FastAPI на 8 GiB (политика stop/start или вынос dev ML).
- [ ] Merge `dev` → `main` и production-деплой **после** проверки на dev и явного согласия.
