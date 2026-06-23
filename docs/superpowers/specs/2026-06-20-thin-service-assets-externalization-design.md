# Thin Service — Externalization of Assets and Catalogs

**Дата:** 2026-06-20  
**Статус:** Утверждён

## Проблема

Сервис сейчас "толстый" в трёх измерениях:

1. **Репозиторий:** 15 МБ PNG-логотипов (357 файлов) хранятся прямо в git → медленные клоны, раздутый Vercel-бандл
2. **Docker-образ:** все JSON-справочники (~1.4 МБ суммарно) запечены в образ → любое изменение каталога требует полного передеплоя Railway
3. **Скрипты обогащения:** `copy-logo-assets.mjs` и `generate-bank-catalog.mjs` жёстко привязаны к абсолютным путям `~/Yandex.Disk.localized/...` → работают только на одной машине, не CI-ready

Дополнительный контекст: `retailer_catalog.json` пишется в runtime через file lock — не масштабируется при нескольких воркерах и несовместимо с вынесением данных на внешний хост.

## Цели

1. Убрать бинарные файлы из git-репозитория
2. Отвязать скрипты обогащения от Yandex.Disk — работают с любой машины и в CI
3. Вынести все JSON-справочники так, чтобы можно было обновлять их без передеплоя (hot-reload)

## Выбранный подход: Cloudflare R2 + PocketBase

- **Cloudflare R2** — для всех статических ассетов (PNG + JSON-каталоги): CDN-класса раздача, бесплатный тир 10 ГБ / 10 млн запросов в месяц, мгновенная инвалидация кэша
- **PocketBase** — self-hosted (деплоится на Railway как отдельный сервис): встроенный SQLite, встроенный Auth, Admin UI из коробки. Нет паузинга как у Supabase free tier. Подходит для `retailer_catalog`, будущей авторизации и user data на нашем масштабе.

## Архитектура

### Cloudflare R2 bucket `cashback-assets` (публичный)

```
cashback-assets/
  logos/
    banks/          ← 275 × PNG (перенесены из public/logos/banks/)
    markets/        ← 82 × PNG (перенесены из public/logos/markets/)
  catalogs/
    # Фронтенд-каталоги (замена lib/data/)
    bank-catalog.json
    market-retailers.json
    logo-aliases.json
    bank-display-overrides.json

    # Бэкенд-справочники (замена backend/data/)
    bank_category_catalog.json
    market_category_catalog.json
    reference_hierarchy.json
    category_hierarchy.json
    parent_category_enriched.json
    market_parent_enriched.json
    bank_category_unified_overrides.json
    bank_aliases.json
    market_aliases.json
    market_category_overrides.json
    market_parent_synonyms.json
    parent_category_synonyms.json
    parent_category_disambiguation.json
    bank_service_exclusions.json
    bank_offer_entries.json
    bank_named_categories.json
    edadeal_slug_aliases.json
    category_overrides.json
    taxonomy.json
    taxonomy_migration.json
    # все файлы из backend/data/ без исключений
```

**Правило:** все JSON-файлы из `backend/data/` и `lib/data/` переезжают в R2. В Docker-образе остаётся только Python-код и зависимости.

### PocketBase (Railway — отдельный сервис)

**Деплой:** отдельный Railway-сервис из официального Docker-образа `ghcr.io/pocketbase/pocketbase`. Railway persistent volume (`/pb/pb_data`) — данные сохраняются между рестартами.

**Коллекция `retailer_catalog`** (заменяет `backend/data/retailer_catalog.json`):

| Поле | Тип | Описание |
|---|---|---|
| `key` | text (unique) | нормализованный ключ ("детский мир") |
| `unified_parent` | text | |
| `unified_subcategory` | text | |
| `canonical_name` | text | |
| `source` | select | `static` / `llm_web` / `manual` |

Создаётся через PocketBase Admin UI (или миграционный скрипт при первом деплое).

**Ручное курирование:** Admin UI (`https://pb.yourdomain.com/_/`) позволяет добавлять/редактировать ритейлеры прямо в браузере без скриптов — удобно в период активного наполнения каталога.

**Будущие коллекции** (auth / user data) добавляются в тот же PocketBase-инстанс.

## Компоненты

### Новые файлы бэкенда

**`backend/services/catalog_store.py`** — singleton для in-memory кэша каталогов:

```python
# Загружает все JSON-каталоги из R2 при старте.
# Остальные сервисы вызывают catalog_store.get("bank_category_catalog") вместо json.load(open(...))

_catalogs: dict[str, Any] = {}
CATALOG_URLS: dict[str, str] = {
    "bank_category_catalog": f"{ASSETS_URL}/catalogs/bank_category_catalog.json",
    "reference_hierarchy": f"{ASSETS_URL}/catalogs/reference_hierarchy.json",
    # ... все остальные файлы
}

async def load_all() -> None: ...
    # httpx timeout=30s, retry до 3 раз с экспоненциальной паузой
    # market_category_catalog.json ~877 КБ — самый крупный файл, ожидаемо 1–3s
def get(name: str) -> Any: ...
```

**`backend/routers/admin.py`** — hot-reload endpoint:

```
POST /api/admin/reload-catalogs
Header: X-Admin-Key: <ADMIN_KEY>
→ вызывает catalog_store.load_all()
→ возвращает {"reloaded": ["bank_category_catalog", ...]}
```

### Изменяемые файлы бэкенда

- **`backend/main.py`** — lifespan: `await catalog_store.load_all()` при старте
- **`backend/services/mapper_service.py`**, **`reference_mapper_service.py`**, **`category_classifier_service.py`** и все остальные сервисы — заменяют `json.load(open("data/xxx.json"))` на `catalog_store.get("xxx")`
- **`backend/services/retailer_resolver_service.py`** — `lookup()` / `enrich_and_save()` переходят с file lock + JSON на запросы к PocketBase REST API через `httpx` (библиотека `pocketbase` для Python или прямые HTTP-запросы)

### Скрипты

**`scripts/upload-assets.mjs`** (новый, заменяет `copy-logo-assets.mjs`):
- Принимает `--logos-dir <path>` (любая локальная папка с PNG)
- Загружает в R2 через `@aws-sdk/client-s3`
- Env: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`
- CI-ready: работает в GitHub Actions

**`scripts/upload-catalogs.mjs`** (новый):
- Сканирует `backend/data/` и `lib/data/`
- Загружает все JSON в `r2://cashback-assets/catalogs/`
- Запускается вручную после изменения любого справочника

**`scripts/generate-bank-catalog.mjs`** (изменение):
- Принимает путь через аргумент или `BANKS_SOURCE_DIR` env вместо hardcoded Yandex.Disk пути

### Фронтенд

**`lib/provider-logos.ts`**:
```ts
const ASSETS_URL = process.env.NEXT_PUBLIC_ASSETS_URL ?? ""
// buildCatalog использует ASSETS_URL/logos/banks/${slug}.png
// Fallback на /logos/... если NEXT_PUBLIC_ASSETS_URL не задан (локальная разработка)
```

**`next.config.ts`** — build-time fetch каталогов из R2:
```ts
// Во время сборки Vercel скачивает bank-catalog.json и market-retailers.json из R2
// и встраивает их в статический бандл
```

Обновление каталога банков/маркетов = `node scripts/upload-catalogs.mjs` + `vercel deploy`.

## Переменные окружения

### Бэкенд (Railway)

```
ASSETS_URL=https://pub-xxxx.r2.dev                 # или кастомный домен
POCKETBASE_URL=https://pb.yourdomain.com           # Railway URL PocketBase-сервиса
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=<пароль>
ADMIN_KEY=<случайно сгенерированный ключ для /api/admin/reload-catalogs>
```

### Фронтенд (Vercel)

```
NEXT_PUBLIC_ASSETS_URL=https://pub-xxxx.r2.dev     # или кастомный домен
NEXT_PUBLIC_BACKEND_URL=https://your-railway-app.railway.app
```

## Workflow обновления справочников (после внедрения)

```bash
# Изменили backend/data/bank_category_catalog.json
node scripts/upload-catalogs.mjs
# → файл в R2

# Подгрузить без перезапуска:
curl -X POST https://api.yourdomain.com/api/admin/reload-catalogs \
  -H "X-Admin-Key: $ADMIN_KEY"

# Или просто перезапустить Railway (он загрузит при старте)
```

## Обработка ошибок

- **R2 недоступен при старте бэкенда** → `catalog_store.load_all()` бросает исключение, FastAPI не стартует (fail-fast, Railway перезапустит)
- **Частичная загрузка каталога** → если один файл не загрузился, логировать ошибку, остальные загружаются
- **hot-reload без авторизации** → 403, каталоги не трогаются
- **Фронтенд с недоступным ASSETS_URL** → `<img>` падает в placeholder (`/placeholder.svg`), функциональность не ломается

## Что вне скоупа (MVP)

- Кастомный домен для R2 (можно подключить позже через Cloudflare Workers)
- CDN-кэширование каталогов на уровне R2 (сейчас просто прямые URL)
- Версионирование ассетов (cache-busting через query string)
- Авторизация для admin endpoints через PocketBase Auth (сейчас — статический ADMIN_KEY)
- Бэкап SQLite (Railway persistent volume — рекомендуется настроить периодический snapshot)
- Переезд review-файлов (`market_catalog_review_*.json`) — это dev-артефакты, не нужны в R2

## Диаграмма

```
[Локальная машина / GitHub Actions]
    scripts/upload-assets.mjs   → R2: /logos/
    scripts/upload-catalogs.mjs → R2: /catalogs/

[Vercel Build]
    fetch R2/catalogs/bank-catalog.json  → встраивает в бандл
    NEXT_PUBLIC_ASSETS_URL → логотипы берутся из R2 в runtime

[Railway FastAPI]
    startup → catalog_store.load_all() → fetch R2/catalogs/*.json
    POST /api/admin/reload-catalogs → повторная загрузка без рестарта

    retailer_resolver → PocketBase REST API (lookup + enrich_and_save)

[Railway PocketBase]
    SQLite + persistent volume
    Admin UI → ручное курирование retailer_catalog
    Будущий auth + user data
```
