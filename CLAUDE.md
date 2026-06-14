# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # start dev server at http://localhost:3000
pnpm build      # production build
pnpm lint       # run ESLint
```

There are no tests in this project.

## Architecture

This is a **mobile-first Next.js 16 app** (TypeScript + Tailwind CSS v4 + Framer Motion) deployed on Vercel. It is a Russian-language cashback aggregator: users upload screenshots of bank/supermarket cashback offers, and the app displays a comparison matrix.

### Screen state machine

The entire app is a single-page state machine in [components/cashback-app.tsx](components/cashback-app.tsx). `currentScreen` cycles through these states:

```
empty → gallery → bank-select → processing → results
```

`kind` (`"bank" | "market"`) is set at the `empty` screen and threaded through all subsequent screens to switch between bank cashback and supermarket loyalty data.

### Screen components

All screens live in [components/screens/](components/screens/):

- **`empty-screen`** — landing with two CTA buttons (bank or market flow), plus `UserMenu`
- **`gallery-screen`** — mock iOS photo picker (hardcoded screenshot paths in `BANK_PHOTOS`/`MARKET_PHOTOS`); renders as an `absolute inset-0 z-50` overlay when opened inline from `bank-select-screen`
- **`bank-select-screen`** — user inputs bank/market names; supports multiple entries (each with a paired screenshot); opens `GalleryScreen` as an inline overlay to add more
- **`processing-screen`** — simulated async step before results
- **`results-screen`** — cashback matrix with tabs (Banks / Supermarkets), color-coded tiers, and action sheet (save PNG, share, add widget, upload more, reset)
- **`results-overlays`** — `SavePngOverlay`, `ShareSheet`, `AddWidgetOverlay` (stub overlays)
- **`user-menu`** — avatar dropdown with logout

### Data layer

[lib/cashback-data.ts](lib/cashback-data.ts) is the single source of truth for all static data:

- **`BANKS`** / **`MARKETS`** — provider definitions (`key`, `name`, `logo` path)
- **`CASHBACK_ROWS`** / **`MARKET_CASHBACK_ROWS`** — category → rate mappings (`Partial<Record<BankKey | MarketKey, number>>`)
- **`TOP_BANKS`** / **`TOP_MARKETS`** — autocomplete suggestion lists
- **`getRowTiers(rates)`** — computes `"high" | "mid" | "low"` tier per provider within a row (used for green/yellow/red coloring)
- **`getCurrentMonthYear()`** — returns Russian month name + year

### UI conventions

- Tailwind CSS v4 (no `tailwind.config.js`; config is in `postcss.config.mjs`)
- shadcn/ui is installed (`components.json`) but currently only `components/ui/button.tsx` exists
- All screen transitions use `<AnimatePresence mode="wait">` with `motion.div` (opacity + y-slide, 0.35s)
- The phone shell (`sm:h-[844px] sm:max-w-[400px] sm:rounded-[2.5rem]`) wraps everything and only appears on `sm:` breakpoints; full-screen on mobile
- Color palette: yellow-200 for primary CTAs, slate for text/borders, green/yellow/red for cashback tier badges

### Planned but not yet implemented

- OCR pipeline: screenshot → structured `{raw_category, rate}[]` via multimodal LLM or Document AI
- Category normalization: `raw_category` → unified category from a fixed taxonomy (~20–30 entries in Russian)
- Backend: Python/FastAPI (to be created separately)
- The `gallery-screen` currently uses hardcoded mock screenshot paths; real device photo access is not wired up
