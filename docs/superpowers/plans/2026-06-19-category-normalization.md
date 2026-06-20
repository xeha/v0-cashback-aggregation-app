# Category Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Нормализовать OCR `raw_category` перед `MarketMapperService` (опечатки, порядок слов, синонимы) без LLM в MVP.

**Architecture:** `CategoryNormalizerService` (sanitize → alias → token-set → fuzzy → passthrough) в `POST /api/category/map` для `kind=market`. Маппер lookup по `canonical_key`, display по `display_label` (OCR после sanitize, без префикса «5%»).

**Tech Stack:** FastAPI, rapidfuzz, JSON data files, verify scripts.

**Spec:** `docs/superpowers/specs/2026-06-19-category-normalization-design.md`

---

### Task 1: Data + CategoryNormalizerService

**Files:**
- Create: `backend/data/market_category_aliases.json`
- Create: `backend/services/category_normalizer_service.py`

- [x] Seed aliases (макроны, купаты/колбаски, перестановки)
- [x] Token-set index from consensus keys
- [x] Fuzzy via rapidfuzz ≥ 0.88

### Task 2: Router + schemas + mapper lookup

**Files:**
- Modify: `backend/schemas.py`, `backend/routers/category.py`, `backend/services/market_mapper_service.py`, `backend/main.py`
- Modify: `lib/types.ts`

- [x] `NormalizeResult` → `normalized_raw_category`, `normalize_source` on `MappedItem`
- [x] `map_items(..., lookup_raw=)` preserves OCR `raw_category` for display
- [x] `display_label` strips rate prefix for UI (`5% Макароны` → `Макароны`)

### Task 3: Verify scripts + requirements

**Files:**
- Create: `scripts/verify_category_normalizer.py`, `scripts/build_category_alias_index.py`
- Modify: `scripts/verify_market_catalog.py`, `backend/requirements.txt`

- [x] Verify normalizer cases + e2e through mapper

**Verification (2026-06-19):** `verify_category_normalizer.py` — 7/7; `verify_market_catalog.py` — 23/23.
