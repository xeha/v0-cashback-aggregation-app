# FastAPI Backend — Фаза 3 (production config)

## Обязательные переменные

| Переменная | Назначение |
|------------|------------|
| `ASSETS_URL` | Timeweb S3 — JSON-каталоги (`/catalogs/*.json`) |
| `MISTRAL_API_KEY` | OCR и LLM-маппинг |
| `ALLOWED_ORIGINS` | CORS для фронта |
| `POCKETBASE_URL` | `retailer_catalog` (чтение/запись) |
| `POCKETBASE_ADMIN_EMAIL` | Superuser PocketBase |
| `POCKETBASE_ADMIN_PASSWORD` | Superuser PocketBase |
| `ADMIN_KEY` | `POST /api/admin/reload-catalogs` |

Шаблон: [`backend/dokploy.env.example`](dokploy.env.example)  
Локальный dev без S3: `CATALOGS_LOCAL=1` (читает `backend/data/`).

> **Docker:** `backend/.dockerignore` исключает `data/` — в prod образе нет `retailer_catalog.json`.  
> При настроенном `POCKETBASE_URL` бэкенд загружает ритейлеров из PocketBase, не из файла.

---

## 1. Подготовка env

```bash
cp backend/dokploy.env.example backend/.env
# Заполнить MISTRAL_API_KEY, POCKETBASE_*, ADMIN_KEY
openssl rand -hex 16   # ADMIN_KEY
```

Креды PocketBase можно взять из `.env.pocketbase` (корень репозитория).

---

## 2. Проверка конфигурации (без полного старта)

```bash
python3 scripts/setup_backend_phase3.py
```

Скрипт проверяет:
- доступность каталогов на S3 (`ASSETS_URL`)
- PocketBase `retailer_catalog` (≥146 записей)
- superuser auth (`_superusers`)

---

## 3. Prod-like старт локально

```bash
cd backend
set -a && source .env && set +a   # или export вручную
uvicorn main:app --port 8000
```

```bash
curl http://localhost:8000/health
# {"status":"ok","mapper_loaded":true,...}
```

Первый старт ~30–60 с (sentence-transformers + загрузка каталогов).

---

## 4. Hot-reload каталогов

```bash
curl -X POST http://localhost:8000/api/admin/reload-catalogs \
  -H "X-Admin-Key: $ADMIN_KEY"
```

---

## 5. Deploy на Dockploy (Фаза 4)

### Два окружения

| | Development | Production |
|---|-------------|------------|
| Ветка | `dev` | `main` |
| API | `api-dev.cashbackbrain.ru` | `api.cashbackbrain.ru` |
| CORS | `dev.cashbackbrain.ru` | `cashbackbrain.ru` |

Полная схема: [`DOKPLOY.md`](../DOKPLOY.md) в корне репозитория.

### Память (VPS)

- Рекомендуемый VPS: **8 GB RAM**
- FastAPI с `sentence-transformers`: ~800 MB–1.2 GB на инстанс
- Dev FastAPI не должен работать 24/7 — `python3 scripts/toggle_dev_stack.py stop`
- Memory limit в Dokploy UI: **1536m** на FastAPI (dev + prod)

### Автоматизация

```bash
# .env.dokploy + backend/.env + .env.pocketbase
python3 scripts/deploy_environment_dokploy.py development
python3 scripts/deploy_environment_dokploy.py production
```

Только FastAPI (production):

```bash
python3 scripts/deploy_fastapi_dokploy.py
```

Скрипт: GitHub `xeha/v0-cashback-aggregation-app@main`, buildPath `backend/`, домен `api.cashbackbrain.ru`.

| Поле | Значение |
|------|----------|
| **appId** | `m3NsWg_snuw8lJ8ZrTthu` |
| **Domain** | `https://api.cashbackbrain.ru` |
| **Health** | `GET /health` |

Первый деплой ~8–10 мин (Docker build + sentence-transformers).

Повторный деплой без push:

```bash
FASTAPI_SKIP_GIT_PUSH=1 python3 scripts/deploy_fastapi_dokploy.py
```

---

## Связь с другими сервисами

| Сервис | Development | Production |
|--------|-------------|------------|
| PocketBase | `https://pb-dev.cashbackbrain.ru` | `https://pb.cashbackbrain.ru` |
| Frontend | `https://dev.cashbackbrain.ru` | `https://cashbackbrain.ru` |
| Dokploy | `https://dokploy.cashbackbrain.ru` | |
| CDN assets | `https://1mh89t7nqb.cdn.twcstorage.ru` | (общий) |

Dev env-шаблон: [`dokploy.dev.env.example`](dokploy.dev.env.example).

См. также: [`pocketbase/DOKPLOY.md`](../pocketbase/DOKPLOY.md)
