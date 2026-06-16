# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend (http://localhost:3000)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev
npm run build
npm run lint

# Backend (http://localhost:8000)
cd backend && pip install -r requirements.txt
cp env.example .env   # set MISTRAL_API_KEY
uvicorn main:app --reload --port 8000
```

There are no tests in this project.

## Architecture

Mobile-first **Next.js 16** frontend (TypeScript + Tailwind v4 + Framer Motion) on Vercel, plus a **stateless FastAPI** backend on Railway for OCR and category mapping. No database, no auth — user data lives in React state only.

### Screen state machine

[components/cashback-app.tsx](components/cashback-app.tsx) manages `currentScreen`:

```
empty → gallery → bank-select → processing → results
```

State held in `CashbackApp`:
- `submissions` — `{ providerName, screenshotSrc, kind }[]` from bank-select
- `matrix` — `{ bank: CashbackMatrix | null, market: CashbackMatrix | null }` after OCR

### OCR pipeline

1. `bank-select-screen` passes submissions upward via `onNext(submissions)`
2. `processing-screen` calls [lib/api.ts](lib/api.ts) for each submission:
   - `POST /api/ocr/extract` — Mistral Vision (base64 image → raw categories)
   - `POST /api/category/map` — sentence-transformers → unified taxonomy
3. [lib/matrix.ts](lib/matrix.ts) merges mapped items into `CashbackMatrix`
4. `results-screen` renders dynamic `matrix` (not static `CASHBACK_ROWS`)

### Backend (`backend/`)

- [main.py](backend/main.py) — FastAPI app, CORS, `/health`
- [routers/ocr.py](backend/routers/ocr.py) — `POST /api/ocr/extract`
- [routers/category.py](backend/routers/category.py) — `POST /api/category/map`
- [data/taxonomy.json](backend/data/taxonomy.json) — unified Russian categories
- Env: `MISTRAL_API_KEY`, `ALLOWED_ORIGINS` (see `backend/env.example`)

### Static reference data

[lib/cashback-data.ts](lib/cashback-data.ts) — logos, autocomplete lists, `getRowTiers()`, `getCurrentMonthYear()`. Demo rows (`CASHBACK_ROWS`) are no longer used on the results screen.

### Deployment

- **Vercel:** set `NEXT_PUBLIC_BACKEND_URL` to Railway URL
- **Railway:** deploy `backend/Dockerfile`; set `MISTRAL_API_KEY`, `ALLOWED_ORIGINS`

### Not yet implemented

- JWT / PostgreSQL / persistence between sessions

### Device upload

- `components/image-file-picker.tsx` — hidden `<input type="file">`, opens in user gesture
- `lib/image-utils.ts` — `readImageFile()` (HEIC → JPEG via `heic2any`, compress > 3 MB)
- `public/screenshots/` — demo assets only (not used in UI)
