# Bank Services Exclusion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude bank ecosystem services from OCR output so screenshots like Alfa-Bank pass category mapping without `OcrUnreliableError`.

**Architecture:** Replace `OCR_PROMPT` with bank-service exclusion list; add deterministic post-filter (`bank_service_exclusions.json` + `_filter_bank_services`) as safety net after Mistral parse; expand `category_overrides.json` for main-category synonyms. No frontend changes.

**Tech Stack:** FastAPI, Mistral Vision (`pixtral-12b-2409`), sentence-transformers mapper (unchanged), Node verify script.

**Spec:** `docs/superpowers/specs/2026-06-16-bank-services-exclusion-design.md`

**Estimated total:** ~2 h

---

## File Map

| File | Responsibility |
|------|----------------|
| `backend/data/bank_service_exclusions.json` | Substring patterns to drop after OCR |
| `backend/services/ocr_service.py` | New prompt, `_normalize`, `_filter_bank_services`, wire into `extract_cashback_items` |
| `backend/data/category_overrides.json` | Main-category synonyms; remove T-Bank service override |
| `scripts/verify-bank-service-filter.mjs` | Unit tests for filter logic (mirrors Python) |
| `scripts/verify-alfa-ocr.mjs` | Live OCR smoke test against running backend (optional, needs API key) |

---

### Task 1: Post-filter data + pure filter function (~30 min)

**Files:**
- Create: `backend/data/bank_service_exclusions.json`
- Modify: `backend/services/ocr_service.py`

- [ ] **Step 1: Create exclusions JSON**

```json
[
  "тревел",
  "travel",
  "заправк",
  "афиша",
  "т-город",
  "шопинг в городе",
  "мегамаркет",
  "сбертревел",
  "спасиботревел",
  "втб шопинг",
  "втб путешеств",
  "газпромбанк travel",
  "самокат",
  "купер",
  "еаптека",
  "сбер автопоиск",
  "мой мтс",
  "mts premium",
  "супермаркеты + почта",
  "сервисы яндекса",
  "экосистема яндекса"
]
```

- [ ] **Step 2: Add filter helpers to `ocr_service.py`** (above `_parse_ocr_json`)

```python
from pathlib import Path

EXCLUSIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_service_exclusions.json"


def _normalize_category_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _load_bank_service_patterns() -> list[str]:
    with EXCLUSIONS_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("bank_service_exclusions.json must be a JSON array")
    return [str(entry).strip().lower() for entry in data if str(entry).strip()]


def _is_bank_service_category(raw_category: str, patterns: list[str]) -> bool:
    normalized = _normalize_category_name(raw_category)
    if not normalized:
        return True
    return any(pattern in normalized for pattern in patterns)


def filter_bank_services(items: list[OcrItem]) -> list[OcrItem]:
    patterns = _load_bank_service_patterns()
    return [
        item
        for item in items
        if not _is_bank_service_category(item.raw_category, patterns)
    ]
```

Export `filter_bank_services` for testing; call it from `extract_cashback_items` in Task 3.

- [ ] **Step 3: Create verify script** `scripts/verify-bank-service-filter.mjs`

Mirror normalization + substring match; test Alfa service rows drop, main categories stay:

```javascript
function normalize(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
}

const PATTERNS = [
  "тревел", "заправк", "афиша", "т-город", "шопинг в городе",
  "мегамаркет", "сбертревел", "спасиботревел",
]

function isBankService(raw) {
  const n = normalize(raw)
  return PATTERNS.some((p) => n.includes(p))
}

const cases = [
  ["Кафе и рестораны", false],
  ["Одежда и обувь", false],
  ["Отели в Тревел", true],
  ["Альфа-Заправки", true],
  ["Альфа-Афиша", true],
  ["Молоко", false],
]

let failed = 0
for (const [raw, expectService] of cases) {
  const got = isBankService(raw)
  if (got !== expectService) {
    console.error(`FAIL ${raw}: expected service=${expectService}, got ${got}`)
    failed += 1
  }
}
if (failed) process.exit(1)
console.log("verify-bank-service-filter: ok")
```

Extend patterns in script to match JSON once file exists.

- [ ] **Step 4: Run verify**

```bash
node scripts/verify-bank-service-filter.mjs
```

Expected: `verify-bank-service-filter: ok`

---

### Task 2: Replace OCR prompt (~20 min)

**Files:**
- Modify: `backend/services/ocr_service.py`

- [ ] **Step 1: Replace `OCR_PROMPT` constant** with full text from spec section «OCR-промпт (целевой текст)» (`docs/superpowers/specs/2026-06-16-bank-services-exclusion-design.md` lines 33–93). Use triple-quoted Python string; keep supermarket rules at the end.

- [ ] **Step 2: Restart uvicorn** (or wait for `--reload`) so prompt is picked up.

---

### Task 3: Wire filter into extract pipeline (~15 min)

**Files:**
- Modify: `backend/services/ocr_service.py`

- [ ] **Step 1: Apply filter after parse in `extract_cashback_items`**

In every return path that yields parsed items, wrap with `filter_bank_services`:

```python
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "items" in parsed:
            return filter_bank_services(_parse_ocr_json(json.dumps(parsed["items"])))
        if isinstance(parsed, list):
            return filter_bank_services(_parse_ocr_json(json.dumps(parsed)))
        return filter_bank_services(_parse_ocr_json(content))
    except (json.JSONDecodeError, ValueError):
        return filter_bank_services(_parse_ocr_json(content))
```

- [ ] **Step 2: Quick Python smoke in shell**

```bash
cd backend && .venv/bin/python -c "
from services.ocr_service import filter_bank_services
from schemas import OcrItem
items = [
    OcrItem(raw_category='Кафе и рестораны', rate=5),
    OcrItem(raw_category='Отели в Тревел', rate=10),
]
out = filter_bank_services(items)
assert len(out) == 1 and out[0].raw_category == 'Кафе и рестораны'
print('filter ok')
"
```

Expected: `filter ok`

---

### Task 4: Category overrides (~10 min)

**Files:**
- Modify: `backend/data/category_overrides.json`

- [ ] **Step 1: Replace file contents**

```json
{
  "кафе и рестораны": "Кафе, бары, рестораны",
  "рестораны и кафе": "Кафе, бары, рестораны",
  "активный отдых": "Спорт и фитнес",
  "детский мир": "Товары для детей",
  "фастфуд и кафе": "Фастфуд"
}
```

Note: removed `"шопинг в городе"` (T-Bank service — excluded by OCR/filter, not mapped).

- [ ] **Step 2: Restart backend** (mapper loads overrides at startup via `MapperService.load()`).

---

### Task 5: End-to-end verification (~30 min)

**Files:**
- Create: `scripts/verify-alfa-ocr.mjs` (optional but recommended)

- [ ] **Step 1: Live OCR test** (backend on `:8000`, `MISTRAL_API_KEY` set)

Use asset from prior session or `public/screenshots/alfa-categories.jpeg` if present:

```bash
node -e "
const fs = require('fs');
const path = 'public/screenshots/alfa-categories.jpeg';
const b64 = fs.readFileSync(path).toString('base64');
(async () => {
  const ocr = await fetch('http://localhost:8000/api/ocr/extract', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ image_base64: b64, mime_type: 'image/jpeg' }),
  }).then(r => r.json());
  console.log('items:', ocr.items.map(i => i.raw_category));
  const names = ocr.items.map(i => i.raw_category);
  const bad = names.filter(n => /тревел|заправ|афиш/i.test(n));
  if (bad.length) { console.error('FAIL services still present:', bad); process.exit(1); }
  if (names.length < 3) { console.error('FAIL too few categories'); process.exit(1); }
  const map = await fetch('http://localhost:8000/api/category/map', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ items: ocr.items, source_name: 'Альфа-Банк' }),
  }).then(r => r.json());
  const fallback = map.items.filter(i => i.unified_category === 'Прочее').length;
  const ratio = fallback / map.items.length;
  console.log('fallback ratio:', ratio.toFixed(2));
  if (ratio >= 0.5) { console.error('FAIL mostly fallback'); process.exit(1); }
  console.log('alfa e2e ok');
})();
"
```

Expected: 4 main categories, `fallback ratio` < 0.5, `alfa e2e ok`.

- [ ] **Step 2: Manual UI** — upload Alfa screenshot in app → processing completes → results matrix shows categories (no error dialog).

- [ ] **Step 3: Run graphify update**

```bash
graphify update .
```

---

### Task 6: Docs (~10 min)

**Files:**
- Modify: `docs/superpowers/specs/2026-06-16-bank-services-exclusion-design.md` — add line under Status: `Implemented YYYY-MM-DD` after merge
- Modify: `CLAUDE.md` — one bullet under OCR: bank services excluded at OCR + post-filter

- [ ] **Step 1: Update CLAUDE.md** (2 lines max)

```markdown
### OCR bank services

- `backend/data/bank_service_exclusions.json` + prompt — ecosystem services (Тревел, Заправки, etc.) excluded from bank screenshots
```

---

## Time Summary

| Task | Estimate |
|------|----------|
| 1. Post-filter + verify script | 30 min |
| 2. OCR prompt | 20 min |
| 3. Wire filter | 15 min |
| 4. Category overrides | 10 min |
| 5. E2E verification | 30 min |
| 6. Docs | 10 min |
| **Total** | **~2 h** |

## Spec Coverage Self-Review

| Spec requirement | Task |
|------------------|------|
| OCR prompt with bank exclusions | Task 2 |
| Post-filter JSON + function | Task 1, 3 |
| category_overrides (no шопинг в городе) | Task 4 |
| No frontend changes | — |
| No isUnreliableMapping change | — |
| Alfa screenshot 4 categories | Task 5 |
