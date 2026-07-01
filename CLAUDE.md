# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend (http://localhost:3000)
# Next.js proxies /api/* → FastAPI on :8000 (see next.config.mjs) — no NEXT_PUBLIC_BACKEND_URL needed locally
npm run dev
npm run build
npm run lint

# Tests
npm run test                    # vitest unit tests
npm run test:integration        # vitest integration tests
npm run test:e2e                # Playwright E2E (localhost)
npm run test:e2e:staging        # Playwright E2E (staging)
npm run test:auth               # auth-specific E2E

# Backend (http://localhost:8000)
cd backend && pip install -r requirements.txt
cp backend/env.example backend/.env   # set MISTRAL_API_KEY etc.
uvicorn main:app --reload --port 8000
```

## Architecture

Mobile-first **Next.js 16** frontend (TypeScript + Tailwind v4 + Framer Motion), **FastAPI** backend, **PocketBase** for auth and saved matrices. Deployed on **Dokploy** on a Timeweb VPS.

### Domains

| Service | Development | Production |
|---------|-------------|------------|
| Frontend | `dev.cashbackbrain.ru` | `cashbackbrain.ru` |
| FastAPI | `api-dev.cashbackbrain.ru` | `api.cashbackbrain.ru` |
| PocketBase | `pb-dev.cashbackbrain.ru` | `pb.cashbackbrain.ru` |

### Deploy workflow

`dev` branch → Dokploy **development** → verify on dev domains → PR to `main` → Dokploy **production**.
Never deploy to production without verifying on development first. See [DOKPLOY.md](DOKPLOY.md).

### Screen state machine

[components/cashback-app.tsx](components/cashback-app.tsx) manages `currentScreen`:

```
empty → gallery → bank-select → processing → results
```

Auth is a modal overlay (`authOpen` state), not a separate screen in the flow.

State held in `CashbackApp`:
- `submissions` — `SourceSubmission[]` from bank-select
- `matrix` — `MatrixState { bank: CashbackMatrix | null, market: CashbackMatrix | null }` after OCR
- `cashbackPeriod` — selected month/year
- `processingSummary` — low-confidence warnings

### OCR pipeline

1. `bank-select-screen` passes submissions upward via `onNext(submissions)`
2. `processing-screen` calls [lib/api.ts](lib/api.ts):
   - **Batch (default):** `POST /api/pipeline/batch` — one request for all submissions
   - **Single fallback:** `POST /api/pipeline/process` — one submission at a time
   - Toggle via `NEXT_PUBLIC_USE_BATCH=0` to disable batch
3. Backend pipeline: Mistral Vision OCR → sentence-transformers category mapping → retailer resolution
4. [lib/matrix.ts](lib/matrix.ts) merges results into `MatrixState`
5. `results-screen` renders dynamic `matrix`

### Backend (`backend/`)

- [main.py](backend/main.py) — FastAPI app, CORS, lifespan (loads models + catalogs)
- [routers/ocr.py](backend/routers/ocr.py) — `POST /api/ocr/extract`
- [routers/category.py](backend/routers/category.py) — `POST /api/category/map`
- [routers/pipeline.py](backend/routers/pipeline.py) — `POST /api/pipeline/process`, `POST /api/pipeline/batch`
- [routers/auth.py](backend/routers/auth.py) — `POST /api/auth/validate-email` (DNS MX check)
- [routers/admin.py](backend/routers/admin.py) — `POST /api/admin/reload-catalogs`
- [routers/bot.py](backend/routers/bot.py) — `POST /bot/webhook` (Telegram bot)

### Backend services (`backend/services/`)

- `mapper_service.py` — bank category mapping via sentence-transformers
- `market_split_map_service.py` — market/grocery category mapping
- `retailer_resolver_service.py` — resolves retailer names to categories
- `ocr_service.py` — Mistral Vision OCR
- `pipeline_service.py` — orchestrates OCR + mapping + matrix merge
- `catalog_store.py` — loads catalogs from PocketBase or local `data/`
- `email_mx_service.py` — DNS MX validation for auth

### Data files (`backend/data/`)

- `category_hierarchy.json` — unified category tree
- `bank_category_catalog.json` — bank cashback categories
- `retailer_catalog.json` — retailer → category mapping
- `bank_service_exclusions.json` — bank ecosystem services excluded from OCR
- `category_overrides.json`, `bank_category_unified_overrides.json` — synonym/override mappings
- `market_category_overrides.json` — market-specific overrides

### Auth & persistence

PocketBase (`pb.cashbackbrain.ru`) handles:
- Email/password auth with email verification
- `saved_matrices` collection — user's saved cashback results

Frontend: [lib/auth-context.tsx](lib/auth-context.tsx), [lib/pocketbase.ts](lib/pocketbase.ts), [lib/saved-matrices.ts](lib/saved-matrices.ts).

### Static reference data

[lib/cashback-data.ts](lib/cashback-data.ts) — logos, autocomplete lists, `getRowTiers()`, `getCurrentMonthYear()`.
[lib/cashback-period.ts](lib/cashback-period.ts) — period selection logic.
[lib/provider-logos.ts](lib/provider-logos.ts) — bank/market logo URLs from CDN.

Logos and catalogs are served from Timeweb CDN (`NEXT_PUBLIC_ASSETS_URL`).

### Telegram bot

[backend/routers/bot.py](backend/routers/bot.py) — `/start` → welcome message with Mini App button.
Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MINI_APP_URL`.
Mini App URL: `https://t.me/CashbackBrain_bot/cashbackbrain`
Register webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.cashbackbrain.ru/bot/webhook"`

### Device upload

- `components/image-file-picker.tsx` — hidden `<input type="file">`, opens in user gesture
- `lib/image-utils.ts` — `readImageFile()` (HEIC → JPEG via `heic2any`, compress > 3 MB)
- `public/screenshots/` — demo assets only (not used in UI)
