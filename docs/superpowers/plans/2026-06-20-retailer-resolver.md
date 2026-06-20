# Retailer Resolver — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Распознавать названия магазинов на банковских скриншотах, маппить их в существующие родительские категории кэшбэка и автоматически пополнять справочник через Mistral Web Search в фоне.

**Architecture:** Отдельный JSON-справочник `retailer_catalog.json` + сервис `RetailerResolverService` с lookup/enrich. В `MapperService` — ранний lookup до эмбеддингов; при MISS — текущий пайплайн + флаг `should_enrich_retailer`. Роутер `category.py` ставит `BackgroundTasks` для обогащения. Импорт из `rf_retailers.json` — одноразовым скриптом.

**Tech Stack:** FastAPI, Pydantic v2, Mistral API (`mistral-small-latest` + web_search), sentence-transformers (существующий mapper), pytest, JSON file storage.

**Spec:** `docs/superpowers/specs/2026-06-20-retailer-resolver-design.md`

---

## Карта файлов

| Файл | Ответственность |
|------|-----------------|
| `backend/data/retailer_catalog.json` | Справочник ритейлер → категория |
| `backend/services/retailer_resolver_service.py` | normalize, lookup, enrich_and_save, persist |
| `scripts/import_rf_retailers.py` | Импорт `rf_retailers.json` → каталог |
| `backend/services/mapper_service.py` | Ранний retailer lookup + should_enrich |
| `backend/routers/category.py` | BackgroundTasks для enrich |
| `backend/main.py` | Инициализация RetailerResolverService в lifespan |
| `backend/schemas.py` | Новые поля/значения match_source |
| `backend/tests/test_retailer_resolver_service.py` | Unit-тесты resolver |
| `backend/tests/test_mapper_retailer_integration.py` | Интеграционные тесты mapper + resolver |
| `scripts/verify_retailer_resolver.py` | Офлайн-проверка lookup |

---

## Важные уточнения к спеку

1. **Родительские категории** — брать из `category_hierarchy.json`, не из упрощённой таблицы спека. Актуальный маппинг секций:

| Секция `rf_retailers.json` | `unified_parent` |
|---|---|
| FMCG — Продукты питания… | `Продукты И Напитки` |
| Fashion — Одежда | `Одежда И Обувь` |
| БиКТ — Бытовая техника… | `Техника И Электроника` |
| Детские товары и одежда | `Для Детей` |
| Косметика, парфюмерия… | `Косметика И Парфюмерия` |
| DIY & Household… | `Дом И Интерьер` |
| Аптеки и здоровье | `Медицина И Здоровье` |
| Спорт и активный отдых | `Спорт И Активный Отдых` |
| Обувь | `Одежда И Обувь` |
| Зоотовары | `Питомцам` |
| Ювелирные украшения | `Подарки` |
| Универсальные маркетплейсы | `Супермаркеты И Маркетплейсы` |

2. **`bank_named_categories.json`** уже содержит `"детский мир"`. После импорта retailer catalog — **не удалять** named categories; retailer lookup идёт **раньше** named/catalog embedding path, но **после** bank catalog (catalog банка остаётся приоритетнее для известных банков).

3. **Порядок в `_map_single_item`:**
   - bank catalog lookup (как сейчас)
   - **retailer catalog lookup** (новое)
   - named categories, synonyms, overrides, leaf exact
   - embeddings + LLM fallback
   - выставить `should_enrich_retailer` если нужно

---

### Task 1: Скрипт импорта и начальный каталог

**Files:**
- Create: `scripts/import_rf_retailers.py`
- Create: `backend/data/retailer_catalog.json` (генерируется скриптом)

- [ ] **Step 1: Написать скрипт импорта**

```python
#!/usr/bin/env python3
"""Import rf_retailers.json into backend/data/retailer_catalog.json."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT.parent / "rf_retailers.json"
OUTPUT = REPO_ROOT / "backend" / "data" / "retailer_catalog.json"

SECTION_TO_PARENT: dict[str, str] = {
    "FMCG — Продукты питания и товары повседневного спроса": "Продукты И Напитки",
    "Fashion — Одежда": "Одежда И Обувь",
    "БиКТ — Бытовая техника, электроника, мобильные устройства": "Техника И Электроника",
    "Детские товары и одежда": "Для Детей",
    "Косметика, парфюмерия и дрогери": "Косметика И Парфюмерия",
    "DIY & Household — Стройматериалы, ремонт, товары для дома": "Дом И Интерьер",
    "Аптеки и здоровье": "Медицина И Здоровье",
    "Спорт и активный отдых": "Спорт И Активный Отдых",
    "Обувь": "Одежда И Обувь",
    "Зоотовары": "Питомцам",
    "Ювелирные украшения": "Подарки",
    "Универсальные маркетплейсы (онлайн)": "Супермаркеты И Маркетплейсы",
}

LEGAL_SUFFIX_RE = re.compile(
    r"\s*[\(\[]\s*(?:ооо|ао|пао|зао|ип|x5 group|магнит)[^)\]]*[\)\]]",
    re.IGNORECASE,
)


def normalize_retailer_name(name: str) -> str:
    cleaned = LEGAL_SUFFIX_RE.sub("", name)
    cleaned = cleaned.split("—")[0].split("-")[0].strip()
    return " ".join(cleaned.lower().split())


def canonical_name(name: str) -> str:
    cleaned = LEGAL_SUFFIX_RE.sub("", name)
    return cleaned.split("(")[0].strip()


def import_retailers(source_path: Path) -> dict:
    rows = json.loads(source_path.read_text(encoding="utf-8"))
    entries: dict[str, dict] = {}
    for row in rows:
        section = row["section"]
        parent = SECTION_TO_PARENT.get(section)
        if not parent:
            raise KeyError(f"Unknown section: {section!r}")
        retailer = row["retailer"]
        key = normalize_retailer_name(retailer)
        if not key:
            continue
        entries[key] = {
            "unified_parent": parent,
            "unified_subcategory": row.get("segment") or parent,
            "canonical_name": canonical_name(retailer),
            "source": "static",
            "rf_section": section,
        }
    return {"version": "1.0", "entries": entries}


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.is_file():
        print(f"Source not found: {source}", file=sys.stderr)
        return 1
    catalog = import_retailers(source)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(catalog['entries'])} entries to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Запустить импорт**

Run:
```bash
cd /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/v0-cashback-aggregation-app
python3 scripts/import_rf_retailers.py /Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/rf_retailers.json
```
Expected: `Wrote ~146 entries to backend/data/retailer_catalog.json`

- [ ] **Step 3: Проверить ключ «детский мир»**

Run:
```bash
python3 -c "import json; d=json.load(open('backend/data/retailer_catalog.json')); print(d['entries'].get('детский мир'))"
```
Expected: `unified_parent: Для Детей`

- [ ] **Step 4: Commit**

```bash
git add scripts/import_rf_retailers.py backend/data/retailer_catalog.json
git commit -m "feat: add retailer catalog import from rf_retailers.json"
```

---

### Task 2: RetailerResolverService — normalize и lookup

**Files:**
- Create: `backend/services/retailer_resolver_service.py`
- Create: `backend/tests/test_retailer_resolver_service.py`
- Test: `backend/tests/test_retailer_resolver_service.py`

- [ ] **Step 1: Написать failing tests**

```python
from pathlib import Path

import pytest

from services.retailer_resolver_service import RetailerResolverService

FIXTURE_CATALOG = Path(__file__).parent / "fixtures" / "mini_retailer_catalog.json"


@pytest.fixture
def resolver(tmp_path: Path) -> RetailerResolverService:
    service = RetailerResolverService(catalog_path=FIXTURE_CATALOG)
    service.load()
    return service


def test_normalize_strips_legal_suffix():
    assert RetailerResolverService.normalize("Детский мир (ПАО)") == "детский мир"


def test_lookup_hit(resolver: RetailerResolverService):
    entry = resolver.lookup("Детский мир")
    assert entry is not None
    assert entry.unified_parent == "Для Детей"


def test_lookup_miss(resolver: RetailerResolverService):
    assert resolver.lookup("Неизвестный Магазин XYZ") is None
```

Создать fixture `backend/tests/fixtures/mini_retailer_catalog.json`:

```json
{
  "version": "1.0",
  "entries": {
    "детский мир": {
      "unified_parent": "Для Детей",
      "unified_subcategory": "Товары для детей",
      "canonical_name": "Детский мир",
      "source": "static"
    }
  }
}
```

- [ ] **Step 2: Запустить тесты — ожидаем FAIL**

Run:
```bash
cd backend && python -m pytest tests/test_retailer_resolver_service.py -v
```
Expected: FAIL — module not found

- [ ] **Step 3: Реализовать минимальный сервис**

```python
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "retailer_catalog.json"

LEGAL_SUFFIX_RE = re.compile(
    r"\s*[\(\[]\s*(?:ооо|ао|пао|зао|ип|x5 group|магнит)[^)\]]*[\)\]]",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RetailerEntry:
    unified_parent: str
    unified_subcategory: str
    canonical_name: str
    source: str


class RetailerResolverService:
    def __init__(self, catalog_path: Path = CATALOG_PATH) -> None:
        self._catalog_path = catalog_path
        self._entries: dict[str, dict] = {}
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @staticmethod
    def normalize(name: str) -> str:
        cleaned = LEGAL_SUFFIX_RE.sub("", name)
        cleaned = cleaned.split("—")[0].split("-")[0].strip()
        return " ".join(cleaned.lower().split())

    def load(self) -> None:
        if self._catalog_path.is_file():
            raw = json.loads(self._catalog_path.read_text(encoding="utf-8"))
            self._entries = raw.get("entries", {})
        else:
            self._entries = {}
        self._loaded = True

    def lookup(self, name: str) -> RetailerEntry | None:
        if not self._loaded:
            raise RuntimeError("RetailerResolverService is not loaded")
        key = self.normalize(name)
        row = self._entries.get(key)
        if not row:
            return None
        return RetailerEntry(
            unified_parent=row["unified_parent"],
            unified_subcategory=row.get("unified_subcategory") or row["unified_parent"],
            canonical_name=row.get("canonical_name") or name.strip(),
            source=row.get("source", "static"),
        )
```

- [ ] **Step 4: Запустить тесты — ожидаем PASS**

Run:
```bash
cd backend && python -m pytest tests/test_retailer_resolver_service.py -v
```
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/retailer_resolver_service.py backend/tests/test_retailer_resolver_service.py backend/tests/fixtures/mini_retailer_catalog.json
git commit -m "feat: add RetailerResolverService lookup and normalize"
```

---

### Task 3: Persist + enrich_and_save (Mistral Web Search)

**Files:**
- Modify: `backend/services/retailer_resolver_service.py`
- Modify: `backend/tests/test_retailer_resolver_service.py`

- [ ] **Step 1: Добавить failing test для save (без сети)**

```python
def test_save_entry_appends_to_catalog(tmp_path: Path):
    catalog_path = tmp_path / "retailer_catalog.json"
    catalog_path.write_text('{"version":"1.0","entries":{}}', encoding="utf-8")
    service = RetailerResolverService(catalog_path=catalog_path)
    service.load()
    service.save_entry(
        key="леонардо",
        unified_parent="Досуг И Отдых",
        unified_subcategory="Хобби и творчество",
        canonical_name="Леонардо",
        source="llm_web",
    )
    service.load()
    entry = service.lookup("Леонардо")
    assert entry is not None
    assert entry.source == "llm_web"
```

- [ ] **Step 2: Реализовать save_entry с file lock**

Добавить в `retailer_resolver_service.py`:

```python
import fcntl
from datetime import datetime, timezone

ALLOWED_PARENTS: list[str] = []  # заполняется в load() из category_hierarchy или параметром


def save_entry(
    self,
    *,
    key: str,
    unified_parent: str,
    unified_subcategory: str,
    canonical_name: str,
    source: str,
) -> None:
    self._catalog_path.parent.mkdir(parents=True, exist_ok=True)
    if self._catalog_path.is_file():
        raw = json.loads(self._catalog_path.read_text(encoding="utf-8"))
    else:
        raw = {"version": "1.0", "entries": {}}
    raw.setdefault("entries", {})[key] = {
        "unified_parent": unified_parent,
        "unified_subcategory": unified_subcategory,
        "canonical_name": canonical_name,
        "source": source,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    payload = json.dumps(raw, ensure_ascii=False, indent=2)
    with self._catalog_path.open("w", encoding="utf-8") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        fh.write(payload)
        fh.flush()
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    self._entries = raw["entries"]
```

- [ ] **Step 3: Добавить enrich_and_save с Mistral**

```python
import os
import re
import logging
from mistralai.client import Mistral

logger = logging.getLogger(__name__)

ENRICH_PROMPT = """Ты эксперт по розничной торговле в России.
Определи, что за магазин/сеть: "{name}".
Выбери ОДНУ родительскую категорию кэшбэка из списка (точное имя).
Подкатегорию сформулируй кратко по профилю магазина.

Список родительских категорий:
{parent_list}

Верни ТОЛЬКО JSON:
{{"unified_parent":"<имя из списка>","unified_subcategory":"<кратко>","canonical_name":"<официальное название>","confidence":<0.0-1.0>}}
"""

def enrich_and_save(self, name: str, *, allowed_parents: list[str] | None = None) -> None:
    key = self.normalize(name)
    if self.lookup(name):
        return
    parents = allowed_parents or self._allowed_parents
    if not parents:
        logger.warning("retailer enrich skipped: allowed_parents empty for %r", name)
        return
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        logger.warning("retailer enrich skipped: MISTRAL_API_KEY missing")
        return
    if os.environ.get("RETAILER_ENRICH_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        return

    client = Mistral(api_key=api_key)
    prompt = ENRICH_PROMPT.format(
        name=name.strip(),
        parent_list="\n".join(f"- {p}" for p in parents),
    )
    response = client.chat.complete(
        model=os.environ.get("MISTRAL_RETAILER_MODEL", "mistral-small-latest"),
        messages=[{"role": "user", "content": prompt}],
        tools=[{"type": "web_search"}],
        tool_choice="auto",
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or ""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    data = json.loads(cleaned)
    parent = str(data.get("unified_parent", "")).strip()
    confidence = float(data.get("confidence", 0.0))
    if parent not in set(parents) or confidence < 0.6:
        logger.warning("retailer enrich rejected for %r: parent=%r conf=%s", name, parent, confidence)
        return
    sub = str(data.get("unified_subcategory", parent)).strip() or parent
    canonical = str(data.get("canonical_name", name)).strip() or name.strip()
    self.save_entry(
        key=key,
        unified_parent=parent,
        unified_subcategory=sub,
        canonical_name=canonical,
        source="llm_web",
    )
```

Добавить `self._allowed_parents: list[str] = []` и метод `set_allowed_parents(parents: list[str])`.

- [ ] **Step 4: Прогнать unit-тест save**

Run:
```bash
cd backend && python -m pytest tests/test_retailer_resolver_service.py::test_save_entry_appends_to_catalog -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/retailer_resolver_service.py backend/tests/test_retailer_resolver_service.py
git commit -m "feat: persist retailer catalog entries and Mistral web enrich"
```

---

### Task 4: should_enrich + интеграция в MapperService

**Files:**
- Modify: `backend/services/mapper_service.py`
- Modify: `backend/schemas.py`
- Create: `backend/tests/test_mapper_retailer_integration.py`

- [ ] **Step 1: Расширить schemas**

В `MappedItem.match_source` добавить `"retailer_catalog"`.
Добавить поле:

```python
should_enrich_retailer: bool = False
```

- [ ] **Step 2: Failing integration test**

```python
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from schemas import CategoryMapRequestItem
from services.mapper_service import MapperService
from services.retailer_resolver_service import RetailerResolverService

FIXTURE_CATALOG = Path(__file__).parent / "fixtures" / "mini_retailer_catalog.json"


@pytest.fixture
def mapper_with_retailer_resolver() -> MapperService:
    mapper = MapperService()
    mapper.load(model=MagicMock())
    resolver = RetailerResolverService(catalog_path=FIXTURE_CATALOG)
    resolver.load()
    resolver.set_allowed_parents(mapper._parents)
    mapper.set_retailer_resolver(resolver)
    return mapper


def test_retailer_lookup_maps_to_parent(mapper_with_retailer_resolver: MapperService):
    items = mapper_with_retailer_resolver.map_items(
        [CategoryMapRequestItem(raw_category="Детский мир", rate=7.0)],
        source_name="Альфа-Банк",
    )
    assert len(items) == 1
    assert items[0].unified_parent == "Для Детей"
    assert items[0].match_source == "retailer_catalog"
    assert items[0].should_enrich_retailer is False


def test_unknown_retailer_sets_enrich_flag(mapper_with_retailer_resolver: MapperService):
    items = mapper_with_retailer_resolver.map_items(
        [CategoryMapRequestItem(raw_category="Leonardo Hobby", rate=5.0)],
        source_name="Т-Банк",
    )
    assert items[0].should_enrich_retailer is True
```

- [ ] **Step 3: Изменить MapperService**

1. Добавить `"retailer_catalog"` в `MatchSource`.
2. Добавить `self._retailer_resolver: RetailerResolverService | None = None`.
3. Метод:

```python
def set_retailer_resolver(self, resolver: RetailerResolverService) -> None:
    self._retailer_resolver = resolver
```

4. В `_map_single_item` после bank catalog block, перед named categories:

```python
if self._retailer_resolver:
    retailer = self._retailer_resolver.lookup(item.raw_category)
    if retailer:
        is_macro = _normalize_category_name(retailer.unified_subcategory) == _normalize_category_name(retailer.unified_parent)
        mapped = self._mapped_item(
            item,
            retailer.unified_subcategory,
            CONFIDENCE_OVERRIDE,
            bank_slug,
            normalized,
            "retailer_catalog",
            parent=retailer.unified_parent,
            is_macro_category=is_macro,
            source_name=source_name,
        )
        mapped.should_enrich_retailer = False
        return mapped
```

5. В конце `_map_single_item`, перед return fallback/embedding result — вычислить enrich:

```python
def _should_enrich_retailer(self, raw_category: str, normalized: str, confidence: float) -> bool:
    if self._retailer_resolver and self._retailer_resolver.lookup(raw_category):
        return False
    if normalized in self._normalized_to_parent:
        return False
    if self._resolve_exact_leaf(normalized):
        return False
    if normalized in self._parent_synonyms:
        return False
    if normalized in self._named_categories:
        return False
    looks_like_brand = raw_category.strip()[:1].isupper()
    low_confidence = confidence < 0.75
    return looks_like_brand or low_confidence
```

Присвоить `mapped.should_enrich_retailer = self._should_enrich_retailer(...)` на всех путях embedding/fallback (не на catalog/named/parent exact).

6. Изменить `_mapped_item` чтобы принимать/пробрасывать `should_enrich_retailer` или ставить после создания.

- [ ] **Step 4: Прогнать тесты**

Run:
```bash
cd backend && python -m pytest tests/test_mapper_retailer_integration.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/mapper_service.py backend/schemas.py backend/tests/test_mapper_retailer_integration.py
git commit -m "feat: integrate retailer catalog lookup into bank mapper"
```

---

### Task 5: BackgroundTasks в роутере и lifespan

**Files:**
- Modify: `backend/routers/category.py`
- Modify: `backend/main.py`
- Modify: `backend/env.example`

- [ ] **Step 1: Инициализация resolver в main.py**

```python
from services.retailer_resolver_service import RetailerResolverService

# inside lifespan, after bank_mapper.load:
retailer_resolver = RetailerResolverService()
retailer_resolver.load()
retailer_resolver.set_allowed_parents(bank_mapper._parents)
bank_mapper.set_retailer_resolver(retailer_resolver)
app.state.retailer_resolver = retailer_resolver
```

- [ ] **Step 2: Обновить category.py**

```python
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

def _get_retailer_resolver(request: Request) -> RetailerResolverService | None:
    return getattr(request.app.state, "retailer_resolver", None)

@router.post("/map", response_model=CategoryMapResponse)
def category_map(
    body: CategoryMapRequest,
    request: Request,
    bg_tasks: BackgroundTasks,
) -> CategoryMapResponse:
    ...
    if body.kind != "market":
        mapper = _get_bank_mapper(request)
        items = mapper.map_items(body.items, body.source_name)
        resolver = _get_retailer_resolver(request)
        if resolver:
            enrich_names = {
                item.raw_category
                for item in items
                if item.should_enrich_retailer
            }
            for name in enrich_names:
                bg_tasks.add_task(resolver.enrich_and_save, name)
        for item in items:
            item.should_enrich_retailer = False  # не отдавать клиенту
    ...
```

- [ ] **Step 3: env.example**

```
RETAILER_ENRICH_ENABLED=true
MISTRAL_RETAILER_MODEL=mistral-small-latest
```

- [ ] **Step 4: Ручная smoke-проверка API**

Run backend:
```bash
cd backend && uvicorn main:app --reload --port 8000
```

Run:
```bash
curl -s -X POST http://localhost:8000/api/category/map \
  -H 'Content-Type: application/json' \
  -d '{"kind":"bank","source_name":"Альфа-Банк","items":[{"raw_category":"Детский мир","rate":7}]}' | python3 -m json.tool
```
Expected: `unified_parent: "Для Детей"`, `match_source: "retailer_catalog"`

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/routers/category.py backend/env.example
git commit -m "feat: wire retailer enrich background tasks in category map"
```

---

### Task 6: Скрипт верификации и graphify update

**Files:**
- Create: `scripts/verify_retailer_resolver.py`

- [ ] **Step 1: Написать verify script**

```python
#!/usr/bin/env python3
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

from services.retailer_resolver_service import RetailerResolverService

CASES = [
    ("Детский мир", "Для Детей"),
    ("Пятёрочка", "Продукты И Напитки"),
    ("Золотое Яблоко", "Косметика И Парфюмерия"),
]

def main() -> int:
    resolver = RetailerResolverService()
    resolver.load()
    failed = 0
    for raw, expected_parent in CASES:
        entry = resolver.lookup(raw)
        ok = entry is not None and entry.unified_parent == expected_parent
        status = "OK" if ok else "FAIL"
        print(f"{status}  {raw!r} -> {entry.unified_parent if entry else None} (expected {expected_parent})")
        failed += 0 if ok else 1
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Запустить verify**

Run:
```bash
python3 scripts/verify_retailer_resolver.py
```
Expected: все OK

- [ ] **Step 3: Обновить graphify**

Run:
```bash
graphify update .
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verify_retailer_resolver.py
git commit -m "chore: add retailer resolver verification script"
```

---

## Self-Review (план vs spec)

| Требование спека | Task |
|---|---|
| `retailer_catalog.json` из rf_retailers | Task 1 |
| normalize + lookup | Task 2 |
| enrich через Mistral web search | Task 3 |
| mapper pre-check + merge в категорию | Task 4 |
| BackgroundTasks | Task 5 |
| file lock, error handling | Task 3 |
| без изменений фронтенда | Task 4–5 (поля enrich не отдаются клиенту) |
| out of scope: PostgreSQL, UI | не включено |

**Исправление vs spec:** таблица `unified_parent` приведена к реальным именам из `category_hierarchy.json`.

---

## Проверка перед merge

```bash
cd backend && python -m pytest tests/ -v
python3 scripts/verify_retailer_resolver.py
cd .. && npm run lint
```

Ручной E2E (опционально, нужен MISTRAL_API_KEY):
1. Загрузить скриншот Альфа-Банка с «Детский мир»
2. Убедиться, что в матрице результатов строка «Для Детей» содержит 7%
