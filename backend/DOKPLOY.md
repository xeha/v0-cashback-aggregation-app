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

## 5. Env для Dockploy (Фаза 4)

Dockploy → **Create Service** → **Git** или **Dockerfile**:

| Поле | Значение |
|------|----------|
| **Name** | `fastapi` / `api` |
| **Build context** | `backend/` |
| **Dockerfile** | `Dockerfile` |
| **Port** | `8000` |
| **Domain** | `api.cashbackbrain.ru` |
| **Health check** | `GET /health` |

Вставить env из `backend/dokploy.env.example` (заполненный).

`ALLOWED_ORIGINS` для prod:

```
https://cashbackbrain.ru,https://www.cashbackbrain.ru,http://localhost:3000
```

---

## Связь с другими сервисами

| Сервис | URL |
|--------|-----|
| PocketBase | `https://pb.cashbackbrain.ru` |
| Frontend | `https://cashbackbrain.ru` |
| S3 assets | `https://fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru` |

См. также: [`pocketbase/DOKPLOY.md`](../pocketbase/DOKPLOY.md)
