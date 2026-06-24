# Thin Service — Externalization of Assets and Catalogs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all PNG logos and JSON catalogs out of git/Docker into Cloudflare R2, replace file-based retailer_catalog with PocketBase, and decouple upload scripts from Yandex.Disk.

**Architecture:** Cloudflare R2 bucket `cashback-assets` serves logos and all JSON reference files via public CDN URL. FastAPI loads catalogs into memory at startup via `catalog_store.py` (singleton); services switch from `json.load(open(...))` to `catalog_store.get("name")`. PocketBase runs as a separate Railway service and replaces the `retailer_catalog.json` file-lock pattern. Frontend logo URLs are prefixed with `NEXT_PUBLIC_ASSETS_URL`.

**Tech Stack:** `@aws-sdk/client-s3` (Node.js scripts, R2 upload), `httpx` (Python, catalog download), PocketBase REST API, Next.js `fetch()` in `next.config.ts` for build-time catalog injection.

---

## File Map

### New files
- `scripts/upload-assets.mjs` — uploads logos PNGs to R2
- `scripts/upload-catalogs.mjs` — uploads all JSON from backend/data/ and lib/data/ to R2
- `backend/services/catalog_store.py` — in-memory cache, loads all JSONs from R2 at startup
- `backend/routers/admin.py` — `POST /api/admin/reload-catalogs` hot-reload endpoint

### Modified files
- `scripts/generate-bank-catalog.mjs` — remove Yandex.Disk hardcoded path, accept env/arg
- `backend/main.py` — add `await catalog_store.load_all()` in lifespan, include admin router
- `backend/services/mapper_service.py` — switch 7 `json.load` calls to `catalog_store.get()`
- `backend/services/reference_hierarchy.py` — switch 1 `json.load` call to `catalog_store.get()`
- `backend/services/bank_slug_resolver.py` — switch 1 `json.load` call to `catalog_store.get()`
- `backend/services/market_slug_resolver.py` — switch 1 `json.load` call to `catalog_store.get()`
- `backend/services/ocr_service.py` — switch 1 `json.load` call to `catalog_store.get()`
- `backend/services/retailer_resolver_service.py` — replace file lock + fcntl with PocketBase REST API
- `backend/requirements.txt` — add `httpx>=0.27.0`
- `lib/provider-logos.ts` — prefix logo paths with `NEXT_PUBLIC_ASSETS_URL`
- `next.config.ts` — build-time fetch of `bank-catalog.json` and `market-retailers.json` from R2
- `backend/Dockerfile` — add `.dockerignore` to exclude `data/` directory
- `.gitignore` — add `public/logos/` after logos are removed from git

---

## Task 1: Infrastructure — R2 bucket + PocketBase on Railway

> **Manual steps — no code.** Run these before any other task.

- [ ] **Step 1: Create Cloudflare R2 bucket**

  1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → R2 Object Storage → Create bucket
  2. Name: `cashback-assets`
  3. Location: Auto (or EU если нужно GDPR)
  4. After creation: Settings → Public access → **Allow public access** → confirm

- [ ] **Step 2: Create R2 API token**

  1. R2 → Manage R2 API Tokens → Create API Token
  2. Permissions: **Object Read & Write**
  3. Specify bucket: `cashback-assets`
  4. Save these values for `.env.local` and Railway:
     ```
     R2_ACCESS_KEY_ID=<value>
     R2_SECRET_ACCESS_KEY=<value>
     R2_BUCKET=cashback-assets
     R2_ENDPOINT=https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com
     R2_PUBLIC_URL=https://pub-<hash>.r2.dev
     ```
  5. Note: `R2_PUBLIC_URL` is shown in bucket settings under "Public R2.dev subdomain"

- [ ] **Step 3: Deploy PocketBase to Railway**

  1. Railway → New Project → Deploy from Docker image
  2. Image: `ghcr.io/pocketbase/pocketbase:latest`
  3. Start command: `/pb/pocketbase serve --http=0.0.0.0:8090`
  4. Expose port: `8090`
  5. Add persistent volume: Mount path `/pb/pb_data`, size 1 GB
  6. After first deploy: open `https://<pb-service>.railway.app/_/` → create admin account
  7. Save Railway service URL as `POCKETBASE_URL`

- [ ] **Step 4: Create `retailer_catalog` collection in PocketBase Admin UI**

  1. Open `https://<pb-url>/_/` → Collections → New collection
  2. Name: `retailer_catalog`, type: **Base**
  3. Add fields:
     - `key` — Text, Required, **Unique** ✓
     - `unified_parent` — Text, Required
     - `unified_subcategory` — Text
     - `canonical_name` — Text, Required
     - `source` — Select, values: `static,llm_web,manual`, Required
  4. Save

- [ ] **Step 5: Add env vars to `.env.local` (frontend) and `backend/.env`**

  `.env.local`:
  ```
  NEXT_PUBLIC_ASSETS_URL=https://pub-<hash>.r2.dev
  NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
  ```

  `backend/.env`:
  ```
  ASSETS_URL=https://pub-<hash>.r2.dev
  POCKETBASE_URL=https://<pb-service>.railway.app
  POCKETBASE_ADMIN_EMAIL=<email>
  POCKETBASE_ADMIN_PASSWORD=<password>
  ADMIN_KEY=<random 32-char string, e.g. `openssl rand -hex 16`>
  ```

---

## Task 2: Upload scripts — R2-ready, no Yandex.Disk

**Files:**
- Create: `scripts/upload-assets.mjs`
- Create: `scripts/upload-catalogs.mjs`
- Modify: `scripts/generate-bank-catalog.mjs`

- [ ] **Step 1: Install AWS SDK**

  ```bash
  npm install --save-dev @aws-sdk/client-s3
  ```

  Expected: `@aws-sdk/client-s3` appears in `devDependencies` of `package.json`.

- [ ] **Step 2: Create `scripts/upload-assets.mjs`**

  ```js
  // scripts/upload-assets.mjs
  // Usage: node scripts/upload-assets.mjs --logos-dir /path/to/png/folder
  // Or set env: LOGOS_BANKS_DIR, LOGOS_MARKETS_DIR
  // Env required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT

  import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
  import { readFileSync, readdirSync } from "node:fs"
  import { join, extname, basename } from "node:path"

  const args = process.argv.slice(2)
  const logosDir = args[args.indexOf("--logos-dir") + 1] ?? null

  const {
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_ENDPOINT,
    LOGOS_BANKS_DIR,
    LOGOS_MARKETS_DIR,
  } = process.env

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ENDPOINT) {
    console.error("Missing R2 env vars: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT")
    process.exit(1)
  }

  const client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })

  async function uploadDir(localDir, r2Prefix) {
    const files = readdirSync(localDir).filter(f => extname(f) === ".png")
    console.log(`Uploading ${files.length} files from ${localDir} → ${r2Prefix}/`)
    for (const file of files) {
      const body = readFileSync(join(localDir, file))
      await client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: `${r2Prefix}/${file}`,
        Body: body,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      }))
      process.stdout.write(".")
    }
    console.log(`\nDone: ${files.length} files uploaded to ${r2Prefix}/`)
  }

  if (logosDir) {
    // Single dir mode: upload everything as logos/banks/
    await uploadDir(logosDir, "logos/banks")
  } else {
    // Separate dirs mode
    if (!LOGOS_BANKS_DIR || !LOGOS_MARKETS_DIR) {
      console.error("Provide --logos-dir OR set LOGOS_BANKS_DIR and LOGOS_MARKETS_DIR env vars")
      process.exit(1)
    }
    await uploadDir(LOGOS_BANKS_DIR, "logos/banks")
    await uploadDir(LOGOS_MARKETS_DIR, "logos/markets")
  }
  ```

- [ ] **Step 3: Create `scripts/upload-catalogs.mjs`**

  ```js
  // scripts/upload-catalogs.mjs
  // Uploads all JSON files from backend/data/ and lib/data/ to R2 under catalogs/
  // Excludes: archive/, review files (market_catalog_review_*)
  // Env required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT

  import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
  import { readFileSync, readdirSync, statSync } from "node:fs"
  import { join, dirname, basename } from "node:path"
  import { fileURLToPath } from "node:url"

  const root = join(dirname(fileURLToPath(import.meta.url)), "..")

  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ENDPOINT) {
    console.error("Missing R2 env vars")
    process.exit(1)
  }

  const SKIP_PATTERNS = [
    /^market_catalog_review_/,   // dev artifacts
    /^edadeal_categories_raw/,   // large raw scrape, not needed at runtime
    /^parsed_market_taxonomies/, // large raw scrape, not needed at runtime
  ]

  const CATALOG_DIRS = [
    join(root, "backend", "data"),
    join(root, "lib", "data"),
  ]

  const client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })

  let total = 0
  for (const dir of CATALOG_DIRS) {
    const files = readdirSync(dir).filter(f => {
      if (!f.endsWith(".json")) return false
      if (SKIP_PATTERNS.some(p => p.test(f))) return false
      if (statSync(join(dir, f)).isDirectory()) return false
      return true
    })

    for (const file of files) {
      const body = readFileSync(join(dir, file))
      await client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: `catalogs/${file}`,
        Body: body,
        ContentType: "application/json",
        CacheControl: "public, max-age=300",  // 5 min cache for catalogs
      }))
      console.log(`  ✓ catalogs/${file}`)
      total++
    }
  }
  console.log(`\nUploaded ${total} catalog files.`)
  ```

- [ ] **Step 4: Run upload scripts to populate R2**

  ```bash
  # Upload logos (adjust paths to where your PNGs actually are)
  LOGOS_BANKS_DIR=public/logos/banks \
  LOGOS_MARKETS_DIR=public/logos/markets \
  R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=cashback-assets R2_ENDPOINT=... \
  node scripts/upload-assets.mjs

  # Upload catalogs
  R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=cashback-assets R2_ENDPOINT=... \
  node scripts/upload-catalogs.mjs
  ```

  Expected: console prints file counts, no errors. Verify in Cloudflare R2 console that `logos/banks/`, `logos/markets/`, `catalogs/` folders exist and are populated.

- [ ] **Step 5: Fix `scripts/generate-bank-catalog.mjs` — remove Yandex.Disk path**

  Current file starts with:
  ```js
  const banksJsonPath =
    "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/banks_logos/banks.json"
  ```

  Replace with:
  ```js
  const banksJsonPath =
    process.env.BANKS_SOURCE_JSON ??
    process.argv[2] ??
    (() => { throw new Error("Provide BANKS_SOURCE_JSON env or path as first argument") })()
  ```

  Now usage: `BANKS_SOURCE_JSON=/path/to/banks.json node scripts/generate-bank-catalog.mjs`

- [ ] **Step 6: Add R2 env vars to `package.json` scripts section (optional convenience)**

  Add to `"scripts"` in `package.json`:
  ```json
  "upload:logos": "node scripts/upload-assets.mjs",
  "upload:catalogs": "node scripts/upload-catalogs.mjs"
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add scripts/upload-assets.mjs scripts/upload-catalogs.mjs scripts/generate-bank-catalog.mjs package.json package-lock.json
  git commit -m "feat: add R2 upload scripts, decouple from Yandex.Disk"
  ```

---

## Task 3: `catalog_store.py` — in-memory catalog cache

**Files:**
- Create: `backend/services/catalog_store.py`
- Modify: `backend/requirements.txt`

All backend services currently load JSON files synchronously at startup via `json.load(open(...))`.
`catalog_store` is a module-level singleton: `load_all()` runs once in FastAPI lifespan (async),
`get(name)` is called synchronously from service `.load()` methods.

- [ ] **Step 1: Add `httpx` to requirements**

  In `backend/requirements.txt`, add:
  ```
  httpx>=0.27.0
  ```

- [ ] **Step 2: Create `backend/services/catalog_store.py`**

  ```python
  from __future__ import annotations

  import asyncio
  import json
  import logging
  import os
  from typing import Any

  import httpx

  logger = logging.getLogger(__name__)

  # Populated by load_all() during FastAPI lifespan.
  # Keys match the JSON filename without extension.
  _store: dict[str, Any] = {}

  # All catalog filenames expected in R2 under /catalogs/
  _CATALOG_NAMES = [
      "bank_category_catalog",
      "market_category_catalog",
      "reference_hierarchy",
      "category_hierarchy",
      "parent_category_enriched",
      "market_parent_enriched",
      "bank_category_unified_overrides",
      "bank_aliases",
      "market_aliases",
      "market_category_overrides",
      "market_parent_synonyms",
      "parent_category_synonyms",
      "parent_category_disambiguation",
      "bank_service_exclusions",
      "bank_offer_entries",
      "bank_named_categories",
      "edadeal_slug_aliases",
      "category_overrides",
      "taxonomy",
      "taxonomy_migration",
      "bank_category_catalog",
      "retailer_catalog",      # kept in R2 as snapshot; runtime writes go to PocketBase
  ]

  # Deduplicated list
  _CATALOG_NAMES = list(dict.fromkeys(_CATALOG_NAMES))


  def _assets_url() -> str:
      url = os.environ.get("ASSETS_URL", "").rstrip("/")
      if not url:
          raise RuntimeError("ASSETS_URL environment variable is not set")
      return url


  async def _fetch_one(client: httpx.AsyncClient, name: str) -> tuple[str, Any]:
      url = f"{_assets_url()}/catalogs/{name}.json"
      for attempt in range(3):
          try:
              resp = await client.get(url, timeout=30.0)
              resp.raise_for_status()
              return name, resp.json()
          except Exception as exc:
              if attempt == 2:
                  raise RuntimeError(f"Failed to load catalog '{name}' from {url}: {exc}") from exc
              wait = 2 ** attempt
              logger.warning("Retrying %s in %ss (attempt %d/3): %s", name, wait, attempt + 1, exc)
              await asyncio.sleep(wait)
      raise RuntimeError("unreachable")  # satisfies type checker


  async def load_all() -> None:
      """Download all catalogs from R2 into memory. Call once during FastAPI lifespan."""
      logger.info("Loading %d catalogs from R2...", len(_CATALOG_NAMES))
      async with httpx.AsyncClient() as client:
          tasks = [_fetch_one(client, name) for name in _CATALOG_NAMES]
          results = await asyncio.gather(*tasks)
      _store.clear()
      for name, data in results:
          _store[name] = data
      logger.info("Catalogs loaded: %s", list(_store.keys()))


  def get(name: str) -> Any:
      """Return catalog by name (filename without .json). Raises KeyError if not loaded."""
      if name not in _store:
          raise KeyError(
              f"Catalog '{name}' not found. Available: {list(_store.keys())}. "
              "Was catalog_store.load_all() called?"
          )
      return _store[name]


  def loaded_names() -> list[str]:
      return list(_store.keys())
  ```

- [ ] **Step 3: Verify the module imports correctly**

  ```bash
  cd backend
  python -c "from services import catalog_store; print('ok')"
  ```

  Expected: `ok`

- [ ] **Step 4: Commit**

  ```bash
  git add backend/services/catalog_store.py backend/requirements.txt
  git commit -m "feat: add catalog_store singleton for R2-backed catalog loading"
  ```

---

## Task 4: Wire `catalog_store` into FastAPI lifespan and admin router

**Files:**
- Modify: `backend/main.py`
- Create: `backend/routers/admin.py`

- [ ] **Step 1: Create `backend/routers/admin.py`**

  ```python
  import os

  from fastapi import APIRouter, Header, HTTPException

  from services import catalog_store

  router = APIRouter()


  @router.post("/api/admin/reload-catalogs")
  async def reload_catalogs(x_admin_key: str = Header(...)) -> dict:
      expected = os.environ.get("ADMIN_KEY", "")
      if not expected or x_admin_key != expected:
          raise HTTPException(status_code=403, detail="Invalid admin key")
      await catalog_store.load_all()
      return {"reloaded": catalog_store.loaded_names()}
  ```

- [ ] **Step 2: Update `backend/main.py` lifespan — add `catalog_store.load_all()`**

  Find the lifespan function (currently starts at `@asynccontextmanager`).
  Add `catalog_store.load_all()` as the **first** thing in lifespan (before services load, because services will call `catalog_store.get()` inside their `.load()` methods):

  ```python
  from services import catalog_store   # add this import at top

  @asynccontextmanager
  async def lifespan(app: FastAPI):
      await catalog_store.load_all()   # ← add this line first

      model_name = os.environ.get(
          "SENTENCE_TRANSFORMER_MODEL",
          "paraphrase-multilingual-MiniLM-L12-v2",
      )
      shared_model = SentenceTransformer(model_name)
      # ... rest of lifespan unchanged ...
  ```

- [ ] **Step 3: Register admin router in `backend/main.py`**

  After the existing `app.include_router(category.router)` line:
  ```python
  from routers import admin   # add to imports at top

  app.include_router(admin.router)   # add after category router
  ```

- [ ] **Step 4: Start the backend (with ASSETS_URL set) and verify**

  ```bash
  cd backend
  ASSETS_URL=https://pub-<hash>.r2.dev uvicorn main:app --reload --port 8000
  ```

  Expected in logs:
  ```
  INFO:services.catalog_store:Loading 21 catalogs from R2...
  INFO:services.catalog_store:Catalogs loaded: ['bank_category_catalog', ...]
  ```

  Then test hot-reload:
  ```bash
  curl -X POST http://localhost:8000/api/admin/reload-catalogs \
    -H "X-Admin-Key: $(grep ADMIN_KEY backend/.env | cut -d= -f2)"
  ```
  Expected: `{"reloaded": ["bank_category_catalog", ...]}`

- [ ] **Step 5: Commit**

  ```bash
  git add backend/main.py backend/routers/admin.py
  git commit -m "feat: load catalogs from R2 at startup, add reload endpoint"
  ```

---

## Task 5: Switch backend services from `json.load(file)` to `catalog_store.get()`

**Files:**
- Modify: `backend/services/mapper_service.py`
- Modify: `backend/services/reference_hierarchy.py`
- Modify: `backend/services/bank_slug_resolver.py`
- Modify: `backend/services/market_slug_resolver.py`
- Modify: `backend/services/ocr_service.py`

The pattern is the same in every file:
1. Remove the module-level `Path(...)` constant for the JSON file
2. In the `load()` / loader function, replace `json.load(open(PATH))` or `json.loads(PATH.read_text(...))` with `catalog_store.get("filename_without_extension")`
3. Add `from services import catalog_store` import

- [ ] **Step 1: Update `backend/services/mapper_service.py`**

  Remove these 7 module-level constants (lines 15–28):
  ```python
  HIERARCHY_PATH = Path(__file__).resolve().parent.parent / "data" / "category_hierarchy.json"
  OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "category_overrides.json"
  CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_category_catalog.json"
  ENRICHED_PATH = Path(__file__).resolve().parent.parent / "data" / "parent_category_enriched.json"
  NAMED_CATEGORIES_PATH = (...)
  BANK_PARENT_SYNONYMS_PATH = (...)
  BANK_OFFER_ENTRIES_PATH = (...)
  ```

  Add import at top:
  ```python
  from services import catalog_store
  ```

  In `load()` method, replace each file read:
  ```python
  # BEFORE:
  hierarchy = json.loads(HIERARCHY_PATH.read_text(encoding="utf-8"))
  # AFTER:
  hierarchy = catalog_store.get("category_hierarchy")

  # BEFORE:
  with OVERRIDES_PATH.open(encoding="utf-8") as f:
      raw_overrides = json.load(f)
  # AFTER:
  raw_overrides = catalog_store.get("category_overrides")

  # BEFORE:
  with CATALOG_PATH.open(encoding="utf-8") as f:
      self._catalog = json.load(f)
  # AFTER:
  self._catalog = catalog_store.get("bank_category_catalog")

  # BEFORE:
  self._enriched = json.loads(ENRICHED_PATH.read_text(encoding="utf-8"))
  # AFTER:
  self._enriched = catalog_store.get("parent_category_enriched")
  ```

  In `_load_named_categories()` function:
  ```python
  # BEFORE:
  raw = json.loads(NAMED_CATEGORIES_PATH.read_text(encoding="utf-8"))
  # AFTER:
  raw = catalog_store.get("bank_named_categories")
  ```

  In the parent synonyms block:
  ```python
  # BEFORE:
  if BANK_PARENT_SYNONYMS_PATH.is_file():
      raw_synonyms = json.loads(BANK_PARENT_SYNONYMS_PATH.read_text(encoding="utf-8"))
  # AFTER:
  raw_synonyms = catalog_store.get("parent_category_synonyms")
  ```

  In `_load_bank_offer_keys()` function:
  ```python
  # BEFORE:
  raw = json.loads(BANK_OFFER_ENTRIES_PATH.read_text(encoding="utf-8"))
  # AFTER:
  raw = catalog_store.get("bank_offer_entries")
  ```

  Also remove `from pathlib import Path` if no other `Path` usage remains.

- [ ] **Step 2: Update `backend/services/reference_hierarchy.py`**

  Remove:
  ```python
  REFERENCE_HIERARCHY_PATH = (
      Path(__file__).resolve().parent.parent / "data" / "reference_hierarchy.json"
  )
  ```

  Add import:
  ```python
  from services import catalog_store
  ```

  In the `load()` / constructor that reads the file (around line 46):
  ```python
  # BEFORE:
  raw_data = json.loads(source_path.read_text(encoding="utf-8"))
  # AFTER:
  raw_data = catalog_store.get("reference_hierarchy")
  ```

  Update the constructor/classmethod signature to not require `source_path` parameter if it was only used for the file read.

- [ ] **Step 3: Update `backend/services/bank_slug_resolver.py`**

  Remove:
  ```python
  ALIASES_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_aliases.json"
  ```

  Add import:
  ```python
  from services import catalog_store
  ```

  In `load_bank_aliases()`:
  ```python
  # BEFORE:
  with ALIASES_PATH.open(encoding="utf-8") as f:
      raw = json.load(f)
  # AFTER:
  raw = catalog_store.get("bank_aliases")
  ```

- [ ] **Step 4: Update `backend/services/market_slug_resolver.py`**

  Remove:
  ```python
  ALIASES_PATH = Path(__file__).resolve().parent.parent / "data" / "market_aliases.json"
  ```

  Add import:
  ```python
  from services import catalog_store
  ```

  In the loader function:
  ```python
  # BEFORE:
  with ALIASES_PATH.open(encoding="utf-8") as f:
      raw = json.load(f)
  # AFTER:
  raw = catalog_store.get("market_aliases")
  ```

- [ ] **Step 5: Update `backend/services/ocr_service.py`**

  Remove:
  ```python
  EXCLUSIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_service_exclusions.json"
  ```

  Add import:
  ```python
  from services import catalog_store
  ```

  In the function that reads exclusions (around line 95):
  ```python
  # BEFORE:
  with EXCLUSIONS_PATH.open(encoding="utf-8") as f:
      data = json.load(f)
  # AFTER:
  data = catalog_store.get("bank_service_exclusions")
  ```

- [ ] **Step 6: Run existing backend tests to verify nothing is broken**

  ```bash
  cd backend
  ASSETS_URL=https://pub-<hash>.r2.dev pytest tests/ -v
  ```

  Expected: all tests pass (tests use fixtures, not live network — if tests fail due to `catalog_store` not loaded, add a `conftest.py` fixture — see Task 5 Step 7).

- [ ] **Step 7: Add test fixture for `catalog_store` in `backend/tests/conftest.py`**

  The existing `conftest.py` may need a fixture that pre-loads catalog_store from local files for tests.

  Open `backend/tests/conftest.py` and add:
  ```python
  import json
  from pathlib import Path
  import pytest
  from services import catalog_store

  DATA_DIR = Path(__file__).resolve().parent.parent / "data"

  @pytest.fixture(autouse=True)
  def load_catalogs_from_local(monkeypatch):
      """Load catalogs from local data/ directory for tests (no R2 needed)."""
      store = {}
      if DATA_DIR.exists():
          for json_file in DATA_DIR.glob("*.json"):
              try:
                  store[json_file.stem] = json.loads(json_file.read_text(encoding="utf-8"))
              except Exception:
                  pass
      monkeypatch.setattr(catalog_store, "_store", store)
  ```

- [ ] **Step 8: Re-run tests**

  ```bash
  cd backend
  pytest tests/ -v
  ```

  Expected: all tests pass.

- [ ] **Step 9: Commit**

  ```bash
  git add backend/services/mapper_service.py \
          backend/services/reference_hierarchy.py \
          backend/services/bank_slug_resolver.py \
          backend/services/market_slug_resolver.py \
          backend/services/ocr_service.py \
          backend/tests/conftest.py
  git commit -m "refactor: switch all backend services to load catalogs from catalog_store"
  ```

---

## Task 6: PocketBase — migrate `retailer_resolver_service.py`

**Files:**
- Modify: `backend/services/retailer_resolver_service.py`
- Modify: `scripts/import_rf_retailers.py` (seed PocketBase instead of writing JSON)

The current service uses `fcntl.flock` file locking for concurrent writes to `retailer_catalog.json`. We replace this with PocketBase REST API calls via `httpx`.

PocketBase REST API for collections:
- `GET /api/collections/retailer_catalog/records?filter=(key='...')` — lookup
- `POST /api/collections/retailer_catalog/records` — create
- Auth header for writes: `Authorization: <admin token>` (obtained via `POST /api/admins/auth-with-password`)

- [ ] **Step 1: Replace `retailer_resolver_service.py` — remove file lock, add PocketBase**

  Replace the entire `CATALOG_PATH` constant and `load()`, `reload()`, `lookup()`, `save_entry()` methods:

  ```python
  # backend/services/retailer_resolver_service.py
  # Replace top-of-file constants:

  import httpx
  import os

  # Remove:  CATALOG_PATH = Path(...) / "data" / "retailer_catalog.json"
  # The file path is no longer needed.

  def _pb_url() -> str:
      return os.environ.get("POCKETBASE_URL", "").rstrip("/")

  def _pb_headers_read() -> dict:
      """PocketBase public collections are readable without auth."""
      return {"Content-Type": "application/json"}

  async def _pb_admin_token() -> str:
      """Get a short-lived admin token for writes."""
      url = f"{_pb_url()}/api/admins/auth-with-password"
      async with httpx.AsyncClient() as client:
          resp = await client.post(url, json={
              "identity": os.environ["POCKETBASE_ADMIN_EMAIL"],
              "password": os.environ["POCKETBASE_ADMIN_PASSWORD"],
          }, timeout=10.0)
          resp.raise_for_status()
          return resp.json()["token"]
  ```

  Replace `load()` and `reload()` methods:
  ```python
  def load(self) -> None:
      # No file to load — entries are fetched on-demand from PocketBase.
      # Pre-warm a small in-memory cache by loading all existing entries.
      import asyncio
      try:
          loop = asyncio.get_event_loop()
          if loop.is_running():
              # In async context (tests / startup), schedule as task
              asyncio.ensure_future(self._warm_cache())
          else:
              loop.run_until_complete(self._warm_cache())
      except Exception as exc:
          logger.warning("Could not warm retailer_catalog cache: %s", exc)
      self._loaded = True

  async def _warm_cache(self) -> None:
      """Load all entries from PocketBase into in-memory _entries dict."""
      url = f"{_pb_url()}/api/collections/retailer_catalog/records"
      params = {"perPage": 500, "page": 1}
      async with httpx.AsyncClient() as client:
          resp = await client.get(url, params=params, timeout=15.0)
          resp.raise_for_status()
          for item in resp.json().get("items", []):
              self._entries[item["key"]] = {
                  "unified_parent": item["unified_parent"],
                  "unified_subcategory": item.get("unified_subcategory", ""),
                  "canonical_name": item["canonical_name"],
                  "source": item["source"],
              }

  def reload(self) -> None:
      import asyncio
      asyncio.get_event_loop().run_until_complete(self._warm_cache())
  ```

  Replace `save_entry()` (remove `fcntl`, use PocketBase):
  ```python
  def save_entry(
      self,
      *,
      key: str,
      unified_parent: str,
      unified_subcategory: str,
      canonical_name: str,
      source: str,
  ) -> None:
      import asyncio
      asyncio.get_event_loop().run_until_complete(
          self._save_entry_async(
              key=key,
              unified_parent=unified_parent,
              unified_subcategory=unified_subcategory,
              canonical_name=canonical_name,
              source=source,
          )
      )

  async def _save_entry_async(self, *, key, unified_parent, unified_subcategory, canonical_name, source) -> None:
      token = await _pb_admin_token()
      headers = {"Authorization": token, "Content-Type": "application/json"}
      payload = {
          "key": key,
          "unified_parent": unified_parent,
          "unified_subcategory": unified_subcategory or "",
          "canonical_name": canonical_name,
          "source": source,
      }
      async with httpx.AsyncClient() as client:
          # Try create, if unique constraint fails (409) → update
          url = f"{_pb_url()}/api/collections/retailer_catalog/records"
          resp = await client.post(url, json=payload, headers=headers, timeout=10.0)
          if resp.status_code == 400 and "unique" in resp.text.lower():
              # Record exists — fetch id and update
              find_resp = await client.get(
                  url,
                  params={"filter": f'(key="{key}")'},
                  timeout=10.0,
              )
              find_resp.raise_for_status()
              items = find_resp.json().get("items", [])
              if items:
                  record_id = items[0]["id"]
                  patch_resp = await client.patch(
                      f"{url}/{record_id}", json=payload, headers=headers, timeout=10.0
                  )
                  patch_resp.raise_for_status()
          else:
              resp.raise_for_status()
      # Update in-memory cache
      self._entries[key] = {
          "unified_parent": unified_parent,
          "unified_subcategory": unified_subcategory,
          "canonical_name": canonical_name,
          "source": source,
      }
      logger.info("Saved retailer entry to PocketBase: %s → %s", key, unified_parent)
  ```

- [ ] **Step 2: Update `scripts/import_rf_retailers.py` — seed PocketBase instead of JSON**

  Find the section of `import_rf_retailers.py` that writes to `retailer_catalog.json` and replace it with a PocketBase bulk-insert:

  ```python
  # At the end of import_rf_retailers.py, replace the JSON write with:
  import asyncio, httpx, os

  PB_URL = os.environ["POCKETBASE_URL"].rstrip("/")

  async def get_admin_token():
      async with httpx.AsyncClient() as c:
          r = await c.post(f"{PB_URL}/api/admins/auth-with-password", json={
              "identity": os.environ["POCKETBASE_ADMIN_EMAIL"],
              "password": os.environ["POCKETBASE_ADMIN_PASSWORD"],
          })
          r.raise_for_status()
          return r.json()["token"]

  async def seed(entries: dict):
      token = await get_admin_token()
      headers = {"Authorization": token}
      async with httpx.AsyncClient() as c:
          for key, rec in entries.items():
              payload = {"key": key, **rec}
              r = await c.post(f"{PB_URL}/api/collections/retailer_catalog/records",
                               json=payload, headers=headers, timeout=10.0)
              if r.status_code not in (200, 201):
                  print(f"  SKIP {key}: {r.text[:80]}")
              else:
                  print(f"  ✓ {key}")

  # entries = { "детский мир": { "unified_parent": "...", ... }, ... }
  asyncio.run(seed(entries))
  ```

- [ ] **Step 3: Seed PocketBase with existing retailer_catalog.json data**

  ```bash
  cd /path/to/project
  POCKETBASE_URL=https://<pb>.railway.app \
  POCKETBASE_ADMIN_EMAIL=admin@example.com \
  POCKETBASE_ADMIN_PASSWORD=<password> \
  python scripts/import_rf_retailers.py
  ```

  Expected: ~146 lines of `✓ ключ` printed, no errors.

- [ ] **Step 4: Test retailer lookup works**

  ```bash
  cd backend
  ASSETS_URL=... POCKETBASE_URL=... POCKETBASE_ADMIN_EMAIL=... POCKETBASE_ADMIN_PASSWORD=... \
  python -c "
  import asyncio
  from services.retailer_resolver_service import RetailerResolverService
  r = RetailerResolverService()
  r.load()
  import time; time.sleep(1)  # let cache warm
  entry = r.lookup('Детский мир')
  print(entry)
  "
  ```

  Expected: `RetailerEntry(unified_parent='Для Детей', ...)`

- [ ] **Step 5: Run backend tests**

  ```bash
  cd backend
  pytest tests/ -v
  ```

  Expected: all tests pass (tests that use `retailer_catalog` fixture in `mini_retailer_catalog.json` may need updating — replace fixture data load with a monkeypatch of `_entries`).

- [ ] **Step 6: Commit**

  ```bash
  git add backend/services/retailer_resolver_service.py scripts/import_rf_retailers.py
  git commit -m "feat: migrate retailer_catalog from file lock to PocketBase REST API"
  ```

---

## Task 7: Frontend — logo URLs via `NEXT_PUBLIC_ASSETS_URL`

**Files:**
- Modify: `lib/provider-logos.ts`
- Modify: `next.config.ts` (or `next.config.js` — whichever exists)

- [ ] **Step 1: Update `lib/provider-logos.ts` — prefix logo paths**

  Find `buildCatalog` calls (around lines 52–58). Currently:
  ```ts
  const bankCatalog: LogoEntry[] = buildCatalog(
    bankCatalogData as CatalogRecord[],
    "/logos/banks",
  )
  const marketCatalog: LogoEntry[] = buildCatalog(
    marketRetailersData as MarketRecord[],
    "/logos/markets",
  )
  ```

  Replace with:
  ```ts
  const ASSETS_URL =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_ASSETS_URL ?? "")
      : ""

  const bankCatalog: LogoEntry[] = buildCatalog(
    bankCatalogData as CatalogRecord[],
    `${ASSETS_URL}/logos/banks`,
  )
  const marketCatalog: LogoEntry[] = buildCatalog(
    marketRetailersData as MarketRecord[],
    `${ASSETS_URL}/logos/markets`,
  )
  ```

  When `NEXT_PUBLIC_ASSETS_URL=""` (local dev with PNGs in `public/`), paths stay as `/logos/banks/...` — same as before. When set to R2 URL, paths become absolute CDN URLs.

- [ ] **Step 2: Check `next.config.ts` exists and add R2 domain to `images` config**

  Open `next.config.ts`. Add the R2 public domain so `<Image>` component works with external URLs:

  ```ts
  import type { NextConfig } from "next"

  const nextConfig: NextConfig = {
    images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "pub-*.r2.dev",  // Cloudflare R2 public URL pattern
        },
      ],
    },
  }

  export default nextConfig
  ```

  If `next.config.ts` already has an `images` key, add the pattern to the existing `remotePatterns` array.

- [ ] **Step 3: Add `NEXT_PUBLIC_ASSETS_URL` to `.env.local`**

  ```
  NEXT_PUBLIC_ASSETS_URL=https://pub-<hash>.r2.dev
  ```

- [ ] **Step 4: Start frontend and verify logos load from R2**

  ```bash
  NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev
  ```

  Open `http://localhost:3000`, navigate to bank selection screen.
  Open browser DevTools → Network tab → filter by `r2.dev`.
  Expected: logo requests go to `https://pub-<hash>.r2.dev/logos/banks/<slug>.png`.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/provider-logos.ts next.config.ts .env.local
  git commit -m "feat: load logos from R2 via NEXT_PUBLIC_ASSETS_URL"
  ```

---

## Task 8: Remove binaries from git, update `.gitignore` and `.dockerignore`

Run this task **after** R2 is confirmed working in production.

- [ ] **Step 1: Add `public/logos/` to `.gitignore`**

  In `.gitignore`, add:
  ```
  # Logos served from R2 — keep locally for dev but not in git
  public/logos/
  ```

- [ ] **Step 2: Remove logos from git tracking**

  ```bash
  git rm -r --cached public/logos/
  ```

  Expected: ~357 PNG files untracked. Git still has them in history but they won't be in future commits or clones.

- [ ] **Step 3: Create/update `backend/.dockerignore`**

  Create `backend/.dockerignore` (or add to existing):
  ```
  data/
  tests/
  __pycache__/
  *.pyc
  .env
  ```

  This ensures `backend/data/*.json` are not copied into the Docker image — the service loads everything from R2 at runtime.

- [ ] **Step 4: Verify Docker build doesn't include data/**

  ```bash
  docker build -t cashback-api-test backend/
  docker run --rm cashback-api-test ls /app/data 2>&1
  ```

  Expected: `ls: cannot access '/app/data': No such file or directory`

- [ ] **Step 5: Final integration test — start backend with only R2**

  ```bash
  cd backend
  # No local data/ files needed
  ASSETS_URL=https://pub-<hash>.r2.dev \
  POCKETBASE_URL=https://<pb>.railway.app \
  POCKETBASE_ADMIN_EMAIL=... \
  POCKETBASE_ADMIN_PASSWORD=... \
  ADMIN_KEY=... \
  uvicorn main:app --port 8000
  ```

  Then:
  ```bash
  curl http://localhost:8000/health
  ```
  Expected: `{"status":"ok","bank_mapper_loaded":true,"market_mapper_loaded":true}`

- [ ] **Step 6: Commit**

  ```bash
  git add .gitignore backend/.dockerignore
  git commit -m "chore: remove logos from git, exclude data/ from Docker image"
  ```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Убрать PNG из git | Task 8 |
| Отвязаться от Yandex.Disk | Task 2 (Step 5) |
| Все JSON → R2 | Task 2, 3 |
| catalog_store singleton | Task 3 |
| Все сервисы используют catalog_store | Task 5 |
| Hot-reload endpoint | Task 4 |
| PocketBase для retailer_catalog | Task 1, 6 |
| Frontend ASSETS_URL | Task 7 |
| .dockerignore data/ | Task 8 |

**Placeholder check:** нет TBD/TODO, все шаги содержат реальный код.

**Type consistency:** `catalog_store.get("bank_category_catalog")` возвращает `Any` — сервисы уже ожидают `dict`, совместимо.
