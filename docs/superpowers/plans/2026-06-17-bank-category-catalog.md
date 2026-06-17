# Bank Category Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Снизить ошибки маппинга OCR → unified taxonomy через банк-специфичный справочник `bank_category_catalog.json`, сгенерированный из `cashback_offers.json`.

**Architecture:** `source_name` резолвится в catalog slug через `bank_aliases.json`. `MapperService` делает exact lookup `(slug, normalized raw) → unified` с confidence 1.0 до глобальных overrides и embedding. Каталог генерируется скриптом `sync_bank_catalog.py`; ручные правки unified — в `bank_category_unified_overrides.json`.

**Tech Stack:** FastAPI, Python 3.11, sentence-transformers (fallback), JSON data files, verify-скрипты (проект без pytest).

**Spec:** `docs/superpowers/specs/2026-06-17-bank-category-catalog-design.md`

**Estimated total:** ~3 h

---

## File Map

| File | Responsibility |
|------|----------------|
| `backend/services/bank_slug_resolver.py` | `resolve_bank_slug(source_name) → str \| None` |
| `backend/data/bank_aliases.json` | Нормализованное имя банка → slug |
| `lib/data/logo-aliases.json` | Доп. алиасы scraped-банков (источник для `bank_aliases.json`) |
| `backend/data/bank_category_unified_overrides.json` | Ручной `category_name → unified` для sync-скрипта |
| `backend/data/bank_category_catalog.json` | Генерируемый per-bank lookup |
| `backend/services/mapper_service.py` | Catalog lookup в `map_items()` |
| `backend/data/category_overrides.json` | Исправить `активный отдых` |
| `scripts/sync_bank_catalog.py` | Генерация каталога из `cashback_offers.json` |
| `scripts/verify_bank_catalog.py` | Прогон кейсов из спека |

---

### Task 1: Bank slug resolver (~25 min)

**Files:**
- Create: `backend/services/bank_slug_resolver.py`
- Create: `backend/data/bank_aliases.json`
- Modify: `lib/data/logo-aliases.json`

- [ ] **Step 1: Дополнить `lib/data/logo-aliases.json`** — в секцию `"bank"` добавить:

```json
"сбербанк": "sberbank-rossii",
"райффайзенбанк": "rajffajzenbank",
"отп банк": "otp-bank",
"отп": "otp-bank",
"озон банк": "ozon-bank",
"озон": "ozon-bank",
"мтс банк": "mts-bank",
"мтс": "mts-bank",
"московский кредитный банк": "moskovskij-kreditnyj-bank",
"мкб": "moskovskij-kreditnyj-bank",
"русский стандарт": "russkij-standart",
"совкомбанк": "sovkombank",
"совком": "sovkombank",
"кредит европа банк": "kredit-evropa-bank",
"убрир": "ubrir",
"газпромбанк": "gazprombank",
"втб": "vtb",
"т-банк": "t-bank",
"тинькофф": "t-bank"
```

(Пропустить ключи, которые уже есть; не дублировать.)

- [ ] **Step 2: Создать `backend/data/bank_aliases.json`**

Объединить `logo-aliases.json["bank"]` + имена из `lib/data/bank-catalog.json` (`name` → `slug`, lowercase):

```json
{
  "сбер": "sberbank-rossii",
  "сбербанк": "sberbank-rossii",
  "альфа-банк": "alfa-bank",
  "отп банк": "otp-bank",
  "убрир": "ubrir"
}
```

Полный файл генерируется в Step 3 скриптом; на MVP достаточно вручную скопировать merged map (все ключи lowercase).

- [ ] **Step 3: Создать `backend/services/bank_slug_resolver.py`**

```python
import json
from pathlib import Path

ALIASES_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_aliases.json"


def _normalize_bank_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def load_bank_aliases() -> dict[str, str]:
    with ALIASES_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)
    return {_normalize_bank_name(k): v for k, v in raw.items()}


def resolve_bank_slug(source_name: str | None, aliases: dict[str, str] | None = None) -> str | None:
    if not source_name or not source_name.strip():
        return None
    mapping = aliases if aliases is not None else load_bank_aliases()
    return mapping.get(_normalize_bank_name(source_name))
```

- [ ] **Step 4: Smoke-test resolver**

```bash
cd backend && python3 -c "
from services.bank_slug_resolver import resolve_bank_slug
assert resolve_bank_slug('Сбер') == 'sberbank-rossii'
assert resolve_bank_slug('ОТП Банк') == 'otp-bank'
assert resolve_bank_slug('ПСБ') == 'promsvjazbank'
assert resolve_bank_slug('УБРиР') == 'ubrir'
assert resolve_bank_slug(None) is None
print('ok')
"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/data/logo-aliases.json backend/data/bank_aliases.json backend/services/bank_slug_resolver.py
git commit -m "feat: add bank slug resolver and aliases for catalog lookup"
```

---

### Task 2: Unified overrides + fix global override (~15 min)

**Files:**
- Create: `backend/data/bank_category_unified_overrides.json`
- Modify: `backend/data/category_overrides.json`

- [ ] **Step 1: Создать `backend/data/bank_category_unified_overrides.json`**

```json
{
  "активный отдых": "Развлечения",
  "азс": "АЗС и топливо",
  "яндекс лавка": "Покупки в приложении банка",
  "яндекс плюс": "Покупки в приложении банка",
  "сберздоровье": "Медицина",
  "озон": "Маркетплейсы",
  "топливо": "АЗС и топливо",
  "кафе, бары и рестораны": "Кафе, бары, рестораны",
  "жкх": "Коммунальные услуги",
  "обучение и образование": "Образование",
  "выбираемые категории": "Прочее",
  "прочее (обучение)": "Образование"
}
```

- [ ] **Step 2: Исправить `backend/data/category_overrides.json`**

Заменить строку:

```json
"активный отдых": "Спорт и фитнес"
```

на:

```json
"активный отдых": "Развлечения"
```

- [ ] **Step 3: Commit**

```bash
git add backend/data/bank_category_unified_overrides.json backend/data/category_overrides.json
git commit -m "fix: correct активный отдых mapping and add unified overrides for catalog sync"
```

---

### Task 3: Sync script + generated catalog (~45 min)

**Files:**
- Create: `scripts/sync_bank_catalog.py`
- Create: `backend/data/bank_category_catalog.json` (generated)

- [ ] **Step 1: Создать `scripts/sync_bank_catalog.py`**

```python
#!/usr/bin/env python3
"""Generate backend/data/bank_category_catalog.json from cashback_offers.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = (
    REPO_ROOT.parent / "sync_category_subcategory" / "cashback_offers.json"
)
TAXONOMY_PATH = REPO_ROOT / "backend" / "data" / "taxonomy.json"
OVERRIDES_PATH = REPO_ROOT / "backend" / "data" / "bank_category_unified_overrides.json"
ALIASES_PATH = REPO_ROOT / "backend" / "data" / "bank_aliases.json"
CATALOG_PATH = REPO_ROOT / "backend" / "data" / "bank_category_catalog.json"
CATALOG_NAMES_PATH = REPO_ROOT / "lib" / "data" / "bank-catalog.json"
LOGO_ALIASES_PATH = REPO_ROOT / "lib" / "data" / "logo-aliases.json"


def normalize(name: str) -> str:
    return " ".join(name.lower().strip().split())


def load_bank_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    if LOGO_ALIASES_PATH.exists():
        logo = json.loads(LOGO_ALIASES_PATH.read_text(encoding="utf-8"))
        for key, slug in logo.get("bank", {}).items():
            aliases[normalize(key)] = slug
    if CATALOG_NAMES_PATH.exists():
        for entry in json.loads(CATALOG_NAMES_PATH.read_text(encoding="utf-8")):
            slug = entry.get("slug")
            name = entry.get("name")
            if slug and name:
                aliases[normalize(name)] = slug
    if ALIASES_PATH.exists():
        for key, slug in json.loads(ALIASES_PATH.read_text(encoding="utf-8")).items():
            aliases[normalize(key)] = slug
    return aliases


def resolve_unified(
    bank_category: str,
    taxonomy: set[str],
    overrides: dict[str, str],
) -> str | None:
    if bank_category in taxonomy:
        return bank_category
    key = normalize(bank_category)
    return overrides.get(key)


def build_catalog(offers: list[dict], aliases: dict[str, str]) -> dict:
    taxonomy_list = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    taxonomy = set(taxonomy_list)
    overrides = {
        normalize(k): v
        for k, v in json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")).items()
    }
    catalog: dict[str, dict[str, dict]] = {}
    unmapped: set[str] = set()
    skipped_banks: set[str] = set()

    def add_entry(slug: str, raw: str, bank_category: str, match_level: str) -> None:
        if not raw:
            return
        unified = resolve_unified(bank_category, taxonomy, overrides)
        if unified is None:
            unmapped.add(bank_category)
        catalog.setdefault(slug, {})[raw] = {
            "bank_category": bank_category,
            "unified": unified,
            "match_level": match_level,
        }

    for offer in offers:
        bank = offer.get("bank", "")
        slug = aliases.get(normalize(bank))
        if not slug:
            skipped_banks.add(bank)
            continue
        category_name = offer.get("category_name", "")
        add_entry(slug, normalize(category_name), category_name, "category")
        for sub in offer.get("subcategories") or []:
            if normalize(sub) == normalize(category_name):
                continue
            add_entry(slug, normalize(sub), category_name, "subcategory")

    if skipped_banks:
        print("WARN: no slug for banks:", ", ".join(sorted(skipped_banks)), file=sys.stderr)
    if unmapped:
        print("WARN: unmapped bank categories (add to overrides):", file=sys.stderr)
        for name in sorted(unmapped):
            print(f"  - {name}", file=sys.stderr)

    return {
        slug: dict(sorted(entries.items()))
        for slug, entries in sorted(catalog.items())
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        nargs="?",
        default=str(DEFAULT_SOURCE),
        help="Path to cashback_offers.json",
    )
    args = parser.parse_args()
    source_path = Path(args.source)
    if not source_path.is_file():
        print(f"ERROR: file not found: {source_path}", file=sys.stderr)
        return 1

    offers = json.loads(source_path.read_text(encoding="utf-8")).get("data", [])
    aliases = load_bank_aliases()
    catalog = build_catalog(offers, aliases)
    CATALOG_PATH.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    entry_count = sum(len(v) for v in catalog.values())
    print(f"Wrote {CATALOG_PATH} ({len(catalog)} banks, {entry_count} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Запустить sync**

```bash
python3 scripts/sync_bank_catalog.py \
  "/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/sync_category_subcategory/cashback_offers.json"
```

Expected: `Wrote .../bank_category_catalog.json (N banks, M entries)`; stderr может содержать WARN для unmapped — дополнить `bank_category_unified_overrides.json` и перезапустить до минимума warnings.

- [ ] **Step 3: Проверить ключевые записи в каталоге**

```bash
python3 -c "
import json
from pathlib import Path
c = json.loads(Path('backend/data/bank_category_catalog.json').read_text())
assert c['yandex-bank']['яндекс лавка']['unified'] == 'Покупки в приложении банка'
assert c['alfa-bank']['активный отдых']['unified'] == 'Развлечения'
assert c['otp-bank']['азс']['unified'] == 'АЗС и топливо'
print('ok')
"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add scripts/sync_bank_catalog.py backend/data/bank_category_catalog.json
git commit -m "feat: add sync script and generated bank category catalog"
```

---

### Task 4: MapperService catalog lookup (~35 min)

**Files:**
- Modify: `backend/services/mapper_service.py`

- [ ] **Step 1: Добавить пути и загрузку каталога**

В начало файла после `OVERRIDES_PATH`:

```python
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_category_catalog.json"

from services.bank_slug_resolver import load_bank_aliases, resolve_bank_slug
```

В `__init__`:

```python
self._catalog: dict[str, dict[str, dict]] = {}
self._bank_aliases: dict[str, str] = {}
```

В `load()` после overrides:

```python
        with CATALOG_PATH.open(encoding="utf-8") as f:
            self._catalog = json.load(f)
        self._bank_aliases = load_bank_aliases()
```

- [ ] **Step 2: Вставить catalog lookup в `map_items()` перед global overrides**

Заменить цикл `for item, query_embedding in zip(...)` на:

```python
        bank_slug = resolve_bank_slug(source_name, self._bank_aliases)

        mapped: list[MappedItem] = []
        pending: list[tuple[CategoryMapRequestItem, np.ndarray]] = []

        for item, query_embedding in zip(items, query_embeddings):
            normalized = _normalize_category_name(item.raw_category)

            if bank_slug:
                entry = self._catalog.get(bank_slug, {}).get(normalized)
                unified = entry.get("unified") if entry else None
                if unified:
                    mapped.append(
                        MappedItem(
                            raw_category=item.raw_category,
                            unified_category=unified,
                            rate=item.rate,
                            confidence=CONFIDENCE_OVERRIDE,
                        )
                    )
                    continue

            override = self._overrides.get(normalized)
            if override:
                mapped.append(
                    MappedItem(
                        raw_category=item.raw_category,
                        unified_category=override,
                        rate=item.rate,
                        confidence=CONFIDENCE_OVERRIDE,
                    )
                )
                continue

            pending.append((item, query_embedding))

        for item, query_embedding in pending:
            similarities = np.dot(self._taxonomy_embeddings, query_embedding)
            best_idx = int(np.argmax(similarities))
            confidence = float(similarities[best_idx])
            unified = (
                self._taxonomy[best_idx]
                if confidence >= self._threshold
                else FALLBACK_CATEGORY
            )
            mapped.append(
                MappedItem(
                    raw_category=item.raw_category,
                    unified_category=unified,
                    rate=item.rate,
                    confidence=round(confidence, 4),
                )
            )

        return mapped
```

Порядок: **catalog → global override → embedding**.

- [ ] **Step 3: Ручной smoke-test mapper (модель загружена)**

```bash
cd backend && python3 -c "
from services.mapper_service import MapperService
from schemas import CategoryMapRequestItem

m = MapperService()
m.load()
items = [
    CategoryMapRequestItem(raw_category='Яндекс Лавка', rate=5.0),
    CategoryMapRequestItem(raw_category='Активный отдых', rate=3.0),
    CategoryMapRequestItem(raw_category='АЗС', rate=5.0),
]
r = m.map_items(items[:1], 'Яндекс Банк')
assert r[0].unified_category == 'Покупки в приложении банка' and r[0].confidence == 1.0
r = m.map_items(items[1:2], 'Альфа-Банк')
assert r[0].unified_category == 'Развлечения'
r = m.map_items(items[2:3], 'ОТП Банк')
assert r[0].unified_category == 'АЗС и топливо'
print('ok')
"
```

Expected: `ok` (первый запуск скачает модель — ~1 min)

- [ ] **Step 4: Commit**

```bash
git add backend/services/mapper_service.py
git commit -m "feat: bank-aware catalog lookup in MapperService"
```

---

### Task 5: Verify script (~25 min)

**Files:**
- Create: `scripts/verify_bank_catalog.py`

- [ ] **Step 1: Создать `scripts/verify_bank_catalog.py`**

```python
#!/usr/bin/env python3
"""Verify bank category catalog mapping cases from design spec."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from schemas import CategoryMapRequestItem  # noqa: E402
from services.mapper_service import MapperService  # noqa: E402

CASES = [
    ("Сбер", "Аптеки", "Аптеки", 1.0),
    ("Яндекс Банк", "Яндекс Лавка", "Покупки в приложении банка", 1.0),
    ("Альфа-Банк", "Активный отдых", "Развлечения", 1.0),
    ("ОТП Банк", "АЗС", "АЗС и топливо", 1.0),
    ("ОТП Банк", "Женская одежда", "Одежда и обувь", 1.0),
]


def main() -> int:
    mapper = MapperService()
    mapper.load()
    failed = 0
    for source_name, raw, expected_unified, expected_conf in CASES:
        items = [CategoryMapRequestItem(raw_category=raw, rate=5.0)]
        result = mapper.map_items(items, source_name)[0]
        ok = (
            result.unified_category == expected_unified
            and result.confidence == expected_conf
        )
        status = "PASS" if ok else "FAIL"
        print(f"{status}: {source_name!r} + {raw!r} -> {result.unified_category!r} ({result.confidence})")
        if not ok:
            print(f"       expected {expected_unified!r} @ {expected_conf}")
            failed += 1

    # ПСБ: нет в scraped catalog — должен идти через embedding, не catalog 1.0
    psb = mapper.map_items(
        [CategoryMapRequestItem(raw_category="Супермаркеты", rate=3.0)],
        "ПСБ",
    )[0]
    if psb.confidence == 1.0 and psb.unified_category == "Супермаркеты":
        print("PASS: ПСБ uses non-catalog path (override or embedding)")
    elif psb.unified_category in ("Супермаркеты", "Продукты питания") and psb.confidence < 1.0:
        print(f"PASS: ПСБ embedding/override path ({psb.unified_category}, {psb.confidence})")
    else:
        print(f"FAIL: ПСБ unexpected {psb.unified_category!r} @ {psb.confidence}")
        failed += 1

    if failed:
        print(f"\n{failed} failed")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Запустить verify**

```bash
python3 scripts/verify_bank_catalog.py
```

Expected: `All checks passed`

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_bank_catalog.py
git commit -m "test: add verify script for bank category catalog mapping"
```

---

### Task 6: Docs + graphify (~10 min)

**Files:**
- Modify: `docs/superpowers/specs/2026-06-16-category-mapping-context-design.md`

- [ ] **Step 1: Добавить примечание в начало спека 16.06**

```markdown
> **Note (2026-06-17):** Per-bank маппинг реализуется через [bank-category-catalog-design.md](./2026-06-17-bank-category-catalog-design.md). `bank_category_definitions.json` для описаний остаётся out of scope.
```

- [ ] **Step 2: Обновить graph**

```bash
graphify update .
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-16-category-mapping-context-design.md
git commit -m "docs: cross-reference bank category catalog spec"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| `bank_category_catalog.json` | Task 3 |
| `bank_category_unified_overrides.json` | Task 2 |
| `bank_aliases.json` | Task 1 |
| `resolve_bank_slug` | Task 1 |
| Catalog lookup in `MapperService` | Task 4 |
| `sync_bank_catalog.py` | Task 3 |
| `verify_bank_catalog.py` | Task 5 |
| Fix `активный отдых` override | Task 2 |
| `logo-aliases.json` updates | Task 1 |
| Subcategory fallback | Task 3 + verify case «Женская одежда» |
| Embedding fallback for unknown | Task 4 + verify ПСБ |
| No frontend changes | — |
| `match_source` field (nice-to-have) | Out of scope this plan |

## Success Criteria (from spec)

1. ≥ 90% типичных `category_name` → confidence 1.0 — проверить после sync: `entry_count` vs offers
2. Яндекс Лавка / Активный отдых / АЗС — Task 5 verify
3. ПСБ не хуже — Task 5 verify
4. Одна команда sync — Task 3
