# Provider Logos — Design Spec

**Date:** 2026-06-15  
**Status:** Approved (brainstorming)  
**Scope:** Full catalog of square PNG logos for banks (rblp) and supermarkets (RSLP)

## Goal

Integrate square provider logos so any bank or supermarket name entered via autocomplete or returned by OCR resolves to the correct logo in the results matrix. Fallback to `/placeholder.svg` when no match is found.

## Decisions

| Decision | Choice |
|----------|--------|
| Catalog scope | Full: 286 banks + 82 markets |
| Bank format | PNG from `rblp/light/png/icon/` |
| Market format | PNG from RSLP `rslp_pack/png/` (512×512) |
| Integration approach | Static files in `public/` + TS catalog module (no build-time sync) |
| Bank autocomplete | Keep `TOP_BANKS` (8 popular names) |
| Market autocomplete | All 82 names from `retailers.json` |

## File Structure

```
public/logos/
├── banks/           # 286 PNG from rblp/light/png/icon/
│   ├── alfabank.png
│   ├── sberbank.png
│   └── ...
└── markets/         # 82 PNG from RSLP rslp_pack/png/
    ├── 5ka.png
    ├── magnit-univer.png
    └── ...

lib/data/
├── market-retailers.json   # copy of RSLP retailers.json
├── bank-catalog.json       # generated from rblp README (slug + Russian name)
└── logo-aliases.json       # manual OCR/input aliases

lib/provider-logos.ts       # catalog loading + resolveProviderLogo()
```

**Removed:** flat `public/logos/*.png` (7 legacy files).

**Asset sources (external, not committed as source trees):**

- Banks: `/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/rblp`
- Markets: `/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/supermarket_logos/rslp_pack`

## Data Layer

### LogoEntry type

```ts
interface LogoEntry {
  slug: string    // filename without .png
  names: string[] // canonical display names
  logo: string    // public URL path
}
```

### Catalog sources

- **Markets:** `market-retailers.json` — each entry `{ slug, name }` maps to `names: [name]`, logo `/logos/markets/{slug}.png`
- **Banks:** `bank-catalog.json` — 286 entries generated once from rblp README table (`id` → slug, Russian name → `names`)

### Aliases (`logo-aliases.json`)

Explicit slug overrides for common OCR/input variants:

```json
{
  "bank": {
    "сбер": "sberbank",
    "т-банк": "tbank",
    "тинькофф": "tbank",
    "яндекс пей": "yandex",
    "яндекс банк": "yandex",
    "псб": "psbank",
    "втб": "vtb",
    "альфа": "alfabank",
    "газпромбанк": "gazprombank",
    "райффайзен": "raiffeisen"
  },
  "market": {
    "пятерочка": "5ka",
    "пятёрочка": "5ka",
    "магнит": "magnit-univer",
    "лента": "lenta-super",
    "метро": "metro-cc",
    "вкусвилл": "vkusvill_offline",
    "перекресток": "perekrestok",
    "перекрёсток": "perekrestok",
    "ашан": "auchan",
    "дикси": "dixy"
  }
}
```

### resolveProviderLogo(name, kind)

1. `normalize(name)` — lowercase, trim, `ё` → `е`, strip extra punctuation
2. Check `logo-aliases.json` for direct slug hit
3. Exact slug match against catalog
4. Substring name match (normalized includes name or name includes normalized)
5. On multiple name matches at step 4, prefer **shortest** `name` (disambiguate «Магнит» vs «Магнит Аптека»)
6. Fallback: `/placeholder.svg`

### Changes to cashback-data.ts

- Update `BANKS` / `MARKETS` logo paths to `/logos/banks/...` and `/logos/markets/...`
- Replace `TOP_MARKETS` with all 82 retailer names (alphabetical)
- Keep `TOP_BANKS` as 8 popular names
- Do **not** change `BankKey`, `MarketKey`, `CASHBACK_ROWS`, or `MARKET_CASHBACK_ROWS` (demo widget only)

### matrix.ts

Replace inline `resolveProviderLogo` with import from `lib/provider-logos.ts`.

## UI

No component changes. Existing `<img src={p.logo}>` in `results-screen.tsx` and `results-overlays.tsx` continues to work.

Logo display classes remain: `h-7 w-7 rounded-lg object-cover` (matrix), `h-4 w-4 rounded-md object-cover` (widget).

## Asset Migration

| Source | Destination | Count |
|--------|-------------|-------|
| `rblp/light/png/icon/*.png` | `public/logos/banks/` | 286 |
| `rslp_pack/png/*.png` | `public/logos/markets/` | 82 |
| `rslp_pack/retailers.json` | `lib/data/market-retailers.json` | 1 |

One-time script `scripts/generate-bank-catalog.mjs` parses rblp README → `lib/data/bank-catalog.json`.

Delete legacy flat files from `public/logos/`.

### Repository size estimate

- Banks: ~0.5 MB
- Markets: ~4.4 MB
- JSON: ~50 KB
- **Total:** ~5 MB static assets

## Verification

1. `npm run build` passes
2. Demo matrix shows logos for existing `BANKS` / `MARKETS` entries
3. Manual checks:
   - `resolveProviderLogo("Сбер", "bank")` → `/logos/banks/sberbank.png`
   - `resolveProviderLogo("Пятёрочка", "market")` → `/logos/markets/5ka.png`
   - `resolveProviderLogo("Метро", "market")` → `/logos/markets/metro-cc.png`
   - `resolveProviderLogo("ВкусВилл", "market")` → `/logos/markets/vkusvill_offline.png`
   - Unknown name → `/placeholder.svg`
4. Market autocomplete datalist shows 82 options

## Out of Scope

- SVG logos for banks (user chose PNG for consistency with markets)
- Dark-theme logo variants (`rblp/dark/`)
- PNG optimization / resizing of 512×512 market logos
- Logo display on `bank-select-screen` (screenshots only, no provider logos)
- Backend logo endpoints
- Fuzzy matching beyond alias table + substring (no Levenshtein)
- Committing external source repos (rblp, supermarket_logos) into this project
- Legal/licensing review of retailer trademarks

## Key Aliases Reference

| User input | Slug | File |
|------------|------|------|
| Пятёрочка | `5ka` | `markets/5ka.png` |
| Магнит | `magnit-univer` | `markets/magnit-univer.png` |
| Лента | `lenta-super` | `markets/lenta-super.png` |
| Метро | `metro-cc` | `markets/metro-cc.png` |
| ВкусВилл | `vkusvill_offline` | `markets/vkusvill_offline.png` |
| Сбер | `sberbank` | `banks/sberbank.png` |
| Т-Банк | `tbank` | `banks/tbank.png` |
| Альфа-Банк | `alfabank` | `banks/alfabank.png` |
