# Auth + PocketBase + Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять PocketBase (БД + auth), реализовать вход пользователей и сохранение матриц, задеплоить стек на Dockploy + Timeweb S3.

**Architecture:** PocketBase хранит users, `retailer_catalog`, `saved_matrices`. Bulk JSON-каталоги и PNG-логотипы остаются в Timeweb S3. FastAPI читает S3 при старте и PocketBase для retailer_catalog. Next.js авторизуется через PocketBase SDK напрямую; OCR/маппинг — через FastAPI (публично на MVP, rate limit позже).

**Tech Stack:** PocketBase 0.22+, Next.js 16, FastAPI, Timeweb S3, Dockploy, `pocketbase` npm package.

**Домены (пример):**
- `cashbackbrain.ru` — фронтенд
- `api.cashbackbrain.ru` — FastAPI
- `pb.cashbackbrain.ru` — PocketBase

---

## Фаза 0: Подготовка (до кода)

### Task 0: S3 и ветка

- [x] **Step 1–5:** S3 готов — все каталоги и логотипы публично доступны. `ASSETS_URL=https://fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru`

---

## Фаза 1: PocketBase на Dockploy

> Подробная инструкция: [`pocketbase/DOKPLOY.md`](../../pocketbase/DOKPLOY.md)  
> Автоматизация коллекций: `scripts/setup_pocketbase.py`

### Task 1: Deploy PocketBase

**Dockploy → New Application → Docker Image**

| Параметр | Значение |
|----------|----------|
| Image | `ghcr.io/pocketbase/pocketbase:latest` |
| Command | `serve --http=0.0.0.0:8090 --dir=/pb/pb_data` |
| Port | `8090` |
| Volume | mount `/pb/pb_data`, 1 GB |
| Domain | `pb.cashbackbrain.ru` |

- [ ] **Step 1:** Deploy, дождаться green status
- [ ] **Step 2:** Открыть `https://pb.cashbackbrain.ru/_/` → создать superadmin (email + password — сохранить в password manager)
- [ ] **Step 3:** Settings → Application → CORS: добавить `https://cashbackbrain.ru`, `http://localhost:3000`

---

### Task 2–3: Коллекции + импорт (одной командой)

- [ ] **Step 1:** После создания superadmin в `/_/`, запустить:

```bash
export POCKETBASE_URL=https://pb.cashbackbrain.ru
export POCKETBASE_ADMIN_EMAIL=ваш@email.com
export POCKETBASE_ADMIN_PASSWORD=ваш_пароль

python scripts/setup_pocketbase.py --import-catalog
```

Создаёт `retailer_catalog`, `saved_matrices` (с API rules) и импортирует 146 записей из `backend/data/retailer_catalog.json`.

- [ ] **Step 2:** Проверить в Admin UI: `retailer_catalog` → Records > 0

---

### Task 4: Auth settings

**Settings → Auth**

- [ ] **Step 1:** Min password length: 8
- [ ] **Step 2:** Email verification: **выкл** на MVP (включить позже)
- [ ] **Step 3:** Auth token duration: 7 days (604800 sec)

---

## Фаза 2: Frontend — авторизация

### Task 5: PocketBase client

**Files:**
- Create: `lib/pocketbase.ts`
- Modify: `env.example`
- Modify: `package.json`

- [ ] **Step 1:** Установить SDK:

```bash
pnpm add pocketbase
```

- [ ] **Step 2:** Создать `lib/pocketbase.ts`:

```typescript
import PocketBase from "pocketbase"

const url = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? ""

export function getPocketBaseUrl(): string {
  if (!url) {
    throw new Error("NEXT_PUBLIC_POCKETBASE_URL is not configured")
  }
  return url
}

export function createPocketBase(): PocketBase {
  return new PocketBase(getPocketBaseUrl())
}
```

- [ ] **Step 3:** Добавить в `env.example`:

```
NEXT_PUBLIC_POCKETBASE_URL=https://pb.cashbackbrain.ru
NEXT_PUBLIC_BACKEND_URL=https://api.cashbackbrain.ru
NEXT_PUBLIC_ASSETS_URL=https://fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru
```

---

### Task 6: Auth provider

**Files:**
- Create: `lib/auth-context.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1:** Создать `lib/auth-context.tsx` — React context с:
  - `pb: PocketBase` (singleton на клиенте)
  - `user: RecordModel | null`
  - `isLoading: boolean`
  - `login(email, password)`, `register(email, password, passwordConfirm)`, `logout()`
  - `onChange` listener на `pb.authStore` для persist token в localStorage (PocketBase делает сам)

- [ ] **Step 2:** Обернуть `app/layout.tsx` в `<AuthProvider>`

- [ ] **Step 3:** Локально проверить: register → refresh → user остаётся залогинен

---

### Task 7: Auth screens

**Files:**
- Create: `components/screens/auth-screen.tsx`
- Modify: `components/cashback-app.tsx`

- [ ] **Step 1:** `auth-screen.tsx` — табы «Вход» / «Регистрация», поля email/password, ошибки на русском, Framer Motion как у других экранов

- [ ] **Step 2:** В `cashback-app.tsx` — если `!user && !isLoading`, рендерить `<AuthScreen />` вместо flow приложения

- [ ] **Step 3:** В header results/empty — кнопка «Выйти»

---

### Task 8: Сохранение матрицы

**Files:**
- Create: `lib/saved-matrices.ts`
- Modify: `components/screens/results-screen.tsx`

- [ ] **Step 1:** `lib/saved-matrices.ts`:

```typescript
import type { CashbackMatrix, MatrixState, ProcessingSummary, SourceSubmission } from "@/lib/types"
import type PocketBase from "pocketbase"
import { getCurrentMonthYear } from "@/lib/cashback-data"

export async function saveMatrix(
  pb: PocketBase,
  payload: {
    matrix: MatrixState
    submissions: SourceSubmission[]
    summary: ProcessingSummary
    title?: string
  },
) {
  const { month, year } = getCurrentMonthYear()
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error("Требуется вход")

  return pb.collection("saved_matrices").create({
    user: userId,
    title: payload.title ?? `Кэшбэк ${month}.${year}`,
    period_month: month,
    period_year: year,
    bank_matrix: payload.matrix.bank,
    market_matrix: payload.matrix.market,
    submissions: payload.submissions,
    summary: payload.summary,
    is_favorite: false,
  })
}
```

- [ ] **Step 2:** На `results-screen.tsx` — кнопка «Сохранить» → вызов `saveMatrix`, toast «Сохранено»

- [ ] **Step 3:** (Опционально MVP+) список сохранённых на empty-screen

---

## Фаза 3: Backend production config

### Task 9: Env и Docker

**Files:**
- Modify: `backend/env.example` (добавить `ADMIN_KEY` если нет)

- [ ] **Step 1:** Сгенерировать ключи:

```bash
openssl rand -hex 16   # ADMIN_KEY
```

- [ ] **Step 2:** Env для Dockploy (FastAPI service):

```
ASSETS_URL=https://fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru
MISTRAL_API_KEY=...
ALLOWED_ORIGINS=https://cashbackbrain.ru,https://www.cashbackbrain.ru,http://localhost:3000
POCKETBASE_URL=https://pb.cashbackbrain.ru
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...
ADMIN_KEY=...
MISTRAL_REQUEST_TIMEOUT_SEC=120
OCR_MAX_IMAGE_DIMENSION=1200
```

- [ ] **Step 3:** Локально проверить prod-like старт:

```bash
cd backend
ASSETS_URL=... POCKETBASE_URL=... POCKETBASE_ADMIN_EMAIL=... POCKETBASE_ADMIN_PASSWORD=... \
  uvicorn main:app --port 8000
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

> **Важно:** `backend/.dockerignore` исключает `data/` — без `ASSETS_URL` бэкенд не стартует. `retailer_catalog.json` в образе нет; нужен PocketBase или fallback через `CATALOGS_LOCAL=1` только для dev.

- [ ] **Step 4:** Убедиться, что `backend/data/retailer_catalog.json` **не** требуется в prod при настроенном `POCKETBASE_URL`

---

## Фаза 4: Deploy на Dockploy

### Task 10: FastAPI

**Dockploy → New Application → Git / Dockerfile**

| Параметр | Значение |
|----------|----------|
| Build context | `backend/` |
| Dockerfile | `backend/Dockerfile` |
| Port | `8000` |
| Domain | `api.cashbackbrain.ru` |
| Health check | `GET /health` |

- [ ] **Step 1:** Deploy с env из Task 9
- [ ] **Step 2:** Проверить:

```bash
curl https://api.cashbackbrain.ru/health
curl https://api.cashbackbrain.ru/docs
```

- [ ] **Step 3:** Smoke OCR (маленький base64 test) или через UI после фронта

---

### Task 11: Next.js frontend

**Вариант A — Vercel (проще для Next.js):**

- [ ] Env: `NEXT_PUBLIC_POCKETBASE_URL`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_ASSETS_URL`
- [ ] Deploy, домен `cashbackbrain.ru`

**Вариант B — Dockploy:**

| Параметр | Значение |
|----------|----------|
| Build | `pnpm build` |
| Start | `pnpm start` |
| Port | `3000` |
| Domain | `cashbackbrain.ru` |

- [ ] **Step 1:** Deploy с env
- [ ] **Step 2:** `pnpm build` локально перед push — убедиться, что нет ошибок

---

### Task 12: DNS

- [ ] `cashbackbrain.ru` → frontend
- [ ] `api.cashbackbrain.ru` → FastAPI
- [ ] `pb.cashbackbrain.ru` → PocketBase
- [ ] SSL через Dockploy/Let's Encrypt (авто)

---

## Фаза 5: E2E проверка

### Task 13: Checklist перед «готово»

- [ ] Регистрация нового пользователя на prod
- [ ] Login / logout / refresh — сессия сохраняется
- [ ] Загрузка скриншота → OCR → матрица (bank flow)
- [ ] «Сохранить» → запись в PocketBase Admin → `saved_matrices`
- [ ] Логотипы грузятся с S3 (Network tab)
- [ ] `retailer_catalog` lookup работает (market/bank с неизвестным ритейлером)
- [ ] CORS: нет ошибок в консоли при запросах к API

---

## Что сознательно НЕ делаем на этом этапе

- Bulk JSON-каталоги в PocketBase — остаются в S3
- OAuth (Google/GitHub) — позже через PocketBase settings
- JWT-проверка на FastAPI OCR endpoints — позже (rate limit + optional auth header)
- `logo_overrides` коллекция — только если slug→png ломается
- Email verification — включить после стабильного prod

---

## Порядок работ (summary)

```
1. S3 upload (catalogs + logos)
2. PocketBase deploy + collections + import retailer_catalog
3. Frontend: pocketbase SDK + auth screens + save matrix
4. FastAPI deploy (ASSETS_URL + POCKETBASE_*)
5. Frontend deploy
6. E2E checklist
```

**Оценка:** ~2–3 дня разработки + 0.5 дня инфраструктура.

---

## Риски

| Риск | Митигация |
|------|-----------|
| Бэкенд не стартует без S3 | Task 0 обязателен первым |
| Нет retailer_catalog в Docker | POCKETBASE_URL обязателен в prod |
| PocketBase volume потерян | Бэкап `/pb/pb_data` в Dockploy |
| Mistral timeout на prod | `MISTRAL_REQUEST_TIMEOUT_SEC=120` уже в коде |
| CORS | `ALLOWED_ORIGINS` + PB CORS settings |
