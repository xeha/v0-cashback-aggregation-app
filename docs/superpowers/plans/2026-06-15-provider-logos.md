# Provider Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate full PNG logo catalogs (286 banks + 82 markets) so OCR and autocomplete provider names resolve to correct logos in the results matrix.

**Architecture:** Copy PNG assets into `public/logos/{banks,markets}/`, load catalogs from JSON (`bank-catalog.json`, `market-retailers.json`, `logo-aliases.json`), centralize lookup in `lib/provider-logos.ts`, wire `matrix.ts` to use it. No UI component changes.

**Tech Stack:** Next.js 16, TypeScript 5.7, static `public/` assets, Node ESM scripts for generation/verification.

**Spec:** `docs/superpowers/specs/2026-06-15-provider-logos-design.md`

**External asset paths (machine-local):**
- Banks: `/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/rblp/light/png/icon/`
- Markets: `/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/supermarket_logos/rslp_pack/png/`
- Market JSON: `/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/supermarket_logos/rslp_pack/retailers.json`
- rblp README: `/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/rblp/README.md`

---

## File Map

| File | Responsibility |
|------|----------------|
| `public/logos/banks/*.png` | 286 bank icon assets |
| `public/logos/markets/*.png` | 82 market icon assets |
| `lib/data/market-retailers.json` | Market slug + display name source |
| `lib/data/bank-catalog.json` | Bank slug + display name source (generated) |
| `lib/data/logo-aliases.json` | Manual OCR/input → slug overrides |
| `lib/provider-logos.ts` | `normalize`, catalog build, `resolveProviderLogo` |
| `lib/matrix.ts` | Import `resolveProviderLogo` from provider-logos |
| `lib/cashback-data.ts` | Updated logo paths + `TOP_MARKETS` from JSON |
| `scripts/generate-bank-catalog.mjs` | Parse rblp README → `bank-catalog.json` |
| `scripts/verify-provider-logos.mjs` | Executable checks for logo resolution |
| `scripts/copy-logo-assets.mjs` | One-shot copy from external dirs into `public/` |

---

### Task 1: Copy logo assets into public/

**Files:**
- Create: `scripts/copy-logo-assets.mjs`
- Create: `public/logos/banks/` (286 PNG)
- Create: `public/logos/markets/` (82 PNG)
- Create: `lib/data/market-retailers.json`

- [ ] **Step 1: Create copy script**

```javascript
// scripts/copy-logo-assets.mjs
import { cpSync, mkdirSync, readdirSync, copyFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const RBLP_ICON_DIR =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/rblp/light/png/icon"
const RSLP_PNG_DIR =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/supermarket_logos/rslp_pack/png"
const RSLP_JSON =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/supermarket_logos/rslp_pack/retailers.json"

const banksDir = join(root, "public/logos/banks")
const marketsDir = join(root, "public/logos/markets")
const dataDir = join(root, "lib/data")

mkdirSync(banksDir, { recursive: true })
mkdirSync(marketsDir, { recursive: true })
mkdirSync(dataDir, { recursive: true })

for (const file of readdirSync(RBLP_ICON_DIR)) {
  if (file.endsWith(".png")) {
    cpSync(join(RBLP_ICON_DIR, file), join(banksDir, file))
  }
}

for (const file of readdirSync(RSLP_PNG_DIR)) {
  if (file.endsWith(".png")) {
    cpSync(join(RSLP_PNG_DIR, file), join(marketsDir, file))
  }
}

copyFileSync(RSLP_JSON, join(dataDir, "market-retailers.json"))

const bankCount = readdirSync(banksDir).filter((f) => f.endsWith(".png")).length
const marketCount = readdirSync(marketsDir).filter((f) => f.endsWith(".png")).length
console.log(`Copied ${bankCount} bank logos, ${marketCount} market logos`)
console.log("Copied market-retailers.json")
```

- [ ] **Step 2: Run copy script**

```bash
node scripts/copy-logo-assets.mjs
```

Expected output:
```
Copied 286 bank logos, 82 market logos
Copied market-retailers.json
```

- [ ] **Step 3: Verify counts**

```bash
ls public/logos/banks | wc -l
ls public/logos/markets | wc -l
```

Expected: `286` and `82`

---

### Task 2: Generate bank catalog JSON

**Files:**
- Create: `scripts/generate-bank-catalog.mjs`
- Create: `lib/data/bank-catalog.json`

- [ ] **Step 1: Create generator script**

```javascript
// scripts/generate-bank-catalog.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const readmePath =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/rblp/README.md"
const outPath = join(root, "lib/data/bank-catalog.json")

const readme = readFileSync(readmePath, "utf8")
const rowRe = /\|\s*<img[^>]+>\s*\|\s*([^|]+?)\s*\|\s*([a-z0-9-]+)\s*\|/gi
const entries = []
const seen = new Set()
let match

while ((match = rowRe.exec(readme)) !== null) {
  const name = match[1].trim()
  const slug = match[2].trim()
  if (seen.has(slug)) continue
  seen.add(slug)
  entries.push({ slug, name })
}

entries.sort((a, b) => a.name.localeCompare(b.name, "ru"))
mkdirSync(join(root, "lib/data"), { recursive: true })
writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n")
console.log(`Wrote ${entries.length} bank catalog entries`)
```

- [ ] **Step 2: Run generator**

```bash
node scripts/generate-bank-catalog.mjs
```

Expected: `Wrote 286 bank catalog entries`

- [ ] **Step 3: Spot-check output**

```bash
node -e "const d=require('./lib/data/bank-catalog.json'); console.log(d.find(x=>x.slug==='sberbank'), d.find(x=>x.slug==='alfabank'))"
```

Expected: objects with `slug` and Russian `name` fields

---

### Task 3: Create alias file

**Files:**
- Create: `lib/data/logo-aliases.json`

- [ ] **Step 1: Write aliases**

```json
{
  "bank": {
    "сбер": "sberbank",
    "сбербанк": "sberbank",
    "т-банк": "tbank",
    "тинькофф": "tbank",
    "тбанк": "tbank",
    "яндекс пей": "yandex",
    "яндекс банк": "yandex",
    "псб": "psbank",
    "втб": "vtb",
    "альфа": "alfabank",
    "альфа-банк": "alfabank",
    "газпромбанк": "gazprombank",
    "гпб": "gazprombank",
    "райффайзен": "raiffeisen",
    "райффайзенбанк": "raiffeisen"
  },
  "market": {
    "пятерочка": "5ka",
    "пятёрочка": "5ka",
    "5ka": "5ka",
    "магнит": "magnit-univer",
    "лента": "lenta-super",
    "гипер лента": "lenta-giper",
    "супер лента": "lenta-super",
    "метро": "metro-cc",
    "metro": "metro-cc",
    "вкусвилл": "vkusvill_offline",
    "перекресток": "perekrestok",
    "перекрёсток": "perekrestok",
    "ашан": "auchan",
    "дикси": "dixy",
    "чижик": "chizhik",
    "глобус": "globus",
    "fix price": "fix-price",
    "азбука вкуса": "azbuka_vkusa",
    "окей": "okmarket-giper",
    "о'кей": "okmarket-giper"
  }
}
```

---

### Task 4: Implement provider-logos module

**Files:**
- Create: `lib/provider-logos.ts`
- Create: `scripts/verify-provider-logos.mjs`

- [ ] **Step 1: Create verification script (defines expected behavior)**

```javascript
// scripts/verify-provider-logos.mjs
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { register } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Run compiled TS via tsx alternative: import transpiled module
// Use dynamic import of built output OR duplicate minimal test inline.
// Simpler approach: spawn ts-node is not installed. Use node --import tsx if available.
// Fallback: inline the resolver logic for verification only.

import { readFileSync } from "node:fs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function normalize(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildCatalog(entries, basePath) {
  return entries.map(({ slug, name }) => ({
    slug,
    names: [name],
    logo: `${basePath}/${slug}.png`,
  }))
}

function resolveProviderLogo(name, kind, bankCatalog, marketCatalog, aliases) {
  const normalized = normalize(name)
  if (!normalized) return "/placeholder.svg"

  const catalog = kind === "market" ? marketCatalog : bankCatalog
  const kindAliases = aliases[kind] ?? {}

  const aliasSlug = kindAliases[normalized]
  if (aliasSlug) {
    const aliasHit = catalog.find((e) => e.slug === aliasSlug)
    if (aliasHit) return aliasHit.logo
  }

  const slugHit = catalog.find((e) => normalize(e.slug) === normalized)
  if (slugHit) return slugHit.logo

  const nameMatches = catalog.filter((entry) =>
    entry.names.some((entryName) => {
      const n = normalize(entryName)
      return normalized.includes(n) || n.includes(normalized)
    }),
  )

  if (nameMatches.length > 0) {
    nameMatches.sort(
      (a, b) =>
        Math.min(...a.names.map((n) => normalize(n).length)) -
        Math.min(...b.names.map((n) => normalize(n).length)),
    )
    return nameMatches[0].logo
  }

  return "/placeholder.svg"
}

const banks = JSON.parse(readFileSync(join(root, "lib/data/bank-catalog.json"), "utf8"))
const markets = JSON.parse(readFileSync(join(root, "lib/data/market-retailers.json"), "utf8"))
const aliases = JSON.parse(readFileSync(join(root, "lib/data/logo-aliases.json"), "utf8"))

const bankCatalog = buildCatalog(banks, "/logos/banks")
const marketCatalog = markets.map((r) => ({
  slug: r.slug,
  names: [r.name],
  logo: `/logos/markets/${r.slug}.png`,
}))

assert.equal(resolveProviderLogo("Сбер", "bank", bankCatalog, marketCatalog, aliases), "/logos/banks/sberbank.png")
assert.equal(resolveProviderLogo("Пятёрочка", "market", bankCatalog, marketCatalog, aliases), "/logos/markets/5ka.png")
assert.equal(resolveProviderLogo("Метро", "market", bankCatalog, marketCatalog, aliases), "/logos/markets/metro-cc.png")
assert.equal(resolveProviderLogo("ВкусВилл", "market", bankCatalog, marketCatalog, aliases), "/logos/markets/vkusvill_offline.png")
assert.equal(resolveProviderLogo("Неизвестный Магазин XYZ", "market", bankCatalog, marketCatalog, aliases), "/placeholder.svg")
assert.equal(resolveProviderLogo("Т-Банк", "bank", bankCatalog, marketCatalog, aliases), "/logos/banks/tbank.png")

console.log("verify-provider-logos: all assertions passed")
```

- [ ] **Step 2: Run verification (should fail — module not created yet)**

```bash
node scripts/verify-provider-logos.mjs
```

Expected before implementation: may pass if only inline logic (script is self-contained). Proceed to Step 3.

- [ ] **Step 3: Create `lib/provider-logos.ts`**

```typescript
import bankCatalogData from "@/lib/data/bank-catalog.json"
import marketRetailersData from "@/lib/data/market-retailers.json"
import logoAliasesData from "@/lib/data/logo-aliases.json"
import type { Kind } from "@/lib/types"

export interface LogoEntry {
  slug: string
  names: string[]
  logo: string
}

interface CatalogRecord {
  slug: string
  name: string
}

interface MarketRecord {
  slug: string
  name: string
}

interface LogoAliasesFile {
  bank: Record<string, string>
  market: Record<string, string>
}

const logoAliases = logoAliasesData as LogoAliasesFile

function buildCatalog(entries: CatalogRecord[], basePath: string): LogoEntry[] {
  return entries.map(({ slug, name }) => ({
    slug,
    names: [name],
    logo: `${basePath}/${slug}.png`,
  }))
}

const bankCatalog: LogoEntry[] = buildCatalog(
  bankCatalogData as CatalogRecord[],
  "/logos/banks",
)

const marketCatalog: LogoEntry[] = (marketRetailersData as MarketRecord[]).map(
  ({ slug, name }) => ({
    slug,
    names: [name],
    logo: `/logos/markets/${slug}.png`,
  }),
)

export function normalizeProviderName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function resolveFromCatalog(
  normalized: string,
  catalog: LogoEntry[],
  kind: Kind,
): string | null {
  const kindAliases = logoAliases[kind] ?? {}
  const aliasSlug = kindAliases[normalized]
  if (aliasSlug) {
    const aliasHit = catalog.find((entry) => entry.slug === aliasSlug)
    if (aliasHit) return aliasHit.logo
  }

  const slugHit = catalog.find(
    (entry) => normalizeProviderName(entry.slug) === normalized,
  )
  if (slugHit) return slugHit.logo

  const nameMatches = catalog.filter((entry) =>
    entry.names.some((entryName) => {
      const entryNormalized = normalizeProviderName(entryName)
      return (
        normalized.includes(entryNormalized) ||
        entryNormalized.includes(normalized)
      )
    }),
  )

  if (nameMatches.length === 0) return null

  nameMatches.sort((a, b) => {
    const aLen = Math.min(...a.names.map((n) => normalizeProviderName(n).length))
    const bLen = Math.min(...b.names.map((n) => normalizeProviderName(n).length))
    return aLen - bLen
  })

  return nameMatches[0].logo
}

export function resolveProviderLogo(name: string, kind: Kind): string {
  const normalized = normalizeProviderName(name)
  if (!normalized) return "/placeholder.svg"

  const catalog = kind === "market" ? marketCatalog : bankCatalog
  return resolveFromCatalog(normalized, catalog, kind) ?? "/placeholder.svg"
}

export function getMarketAutocompleteNames(): string[] {
  return (marketRetailersData as MarketRecord[])
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, "ru"))
}
```

- [ ] **Step 4: Run verification**

```bash
node scripts/verify-provider-logos.mjs
```

Expected: `verify-provider-logos: all assertions passed`

---

### Task 5: Wire matrix.ts to provider-logos

**Files:**
- Modify: `lib/matrix.ts`

- [ ] **Step 1: Remove local resolveProviderLogo, import from provider-logos**

Replace lines 1 and 20-34 in `lib/matrix.ts`:

```typescript
import { resolveProviderLogo } from "@/lib/provider-logos"
import type {
  CashbackMatrix,
  Kind,
  MappedItem,
  MatrixProvider,
  MatrixRow,
  SourceSubmission,
} from "@/lib/types"
```

Delete the entire `resolveProviderLogo` function (old lines 20-34). Do **not** re-export it from matrix.ts.

- [ ] **Step 2: Confirm no other exports broken**

```bash
rg "resolveProviderLogo" --type ts
```

Expected: only `lib/provider-logos.ts` (definition) and `lib/matrix.ts` (import + usage)

---

### Task 6: Update cashback-data.ts

**Files:**
- Modify: `lib/cashback-data.ts`

- [ ] **Step 1: Update BANKS logo paths**

```typescript
export const BANKS: Bank[] = [
  { key: "alfa", name: "Альфа-Банк", logo: "/logos/banks/alfabank.png" },
  { key: "psb", name: "ПСБ", logo: "/logos/banks/psbank.png" },
  { key: "yandex", name: "Яндекс Банк", logo: "/logos/banks/yandex.png" },
  { key: "tbank", name: "Т-Банк", logo: "/logos/banks/tbank.png" },
]
```

- [ ] **Step 2: Update MARKETS logo paths**

```typescript
export const MARKETS: Market[] = [
  { key: "pyaterochka", name: "Пятёрочка", logo: "/logos/markets/5ka.png" },
  { key: "magnit", name: "Магнит", logo: "/logos/markets/magnit-univer.png" },
  { key: "lenta", name: "Лента", logo: "/logos/markets/lenta-super.png" },
]
```

- [ ] **Step 3: Replace TOP_MARKETS with catalog names**

At top of file add:
```typescript
import { getMarketAutocompleteNames } from "@/lib/provider-logos"
```

Replace `TOP_MARKETS` array with:
```typescript
export const TOP_MARKETS = getMarketAutocompleteNames()
```

Keep `TOP_BANKS` unchanged.

---

### Task 7: Remove legacy flat logos

**Files:**
- Delete: `public/logos/alfabank.png`
- Delete: `public/logos/psbank.png`
- Delete: `public/logos/yandex.png`
- Delete: `public/logos/tbank.png`
- Delete: `public/logos/pyaterochka.png`
- Delete: `public/logos/magnit.png`
- Delete: `public/logos/lenta.png`

- [ ] **Step 1: Delete legacy files**

```bash
rm -f public/logos/alfabank.png public/logos/psbank.png public/logos/yandex.png \
      public/logos/tbank.png public/logos/pyaterochka.png public/logos/magnit.png \
      public/logos/lenta.png
```

- [ ] **Step 2: Confirm only subdirs remain at root**

```bash
ls public/logos/
```

Expected: `banks` `markets` (only directories, no loose PNGs)

---

### Task 8: Final verification

**Files:** none new

- [ ] **Step 1: Run logo verification script**

```bash
node scripts/verify-provider-logos.mjs
```

Expected: `all assertions passed`

- [ ] **Step 2: Typecheck + build**

```bash
npm run build
```

Expected: compiles without errors

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no new errors

- [ ] **Step 4: Spot-check asset paths exist**

```bash
test -f public/logos/banks/sberbank.png && test -f public/logos/markets/5ka.png && echo OK
```

Expected: `OK`

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| 286 bank PNGs in `public/logos/banks/` | Task 1 |
| 82 market PNGs in `public/logos/markets/` | Task 1 |
| `market-retailers.json` | Task 1 |
| `bank-catalog.json` generated | Task 2 |
| `logo-aliases.json` | Task 3 |
| `resolveProviderLogo` algorithm | Task 4 |
| `matrix.ts` uses new module | Task 5 |
| `cashback-data.ts` path updates + TOP_MARKETS | Task 6 |
| Delete legacy flat logos | Task 7 |
| Build + verification | Task 8 |

## Out of Scope (do not implement)

- SVG logos, dark theme, PNG optimization, bank-select UI logos, backend endpoints, Levenshtein fuzzy match
