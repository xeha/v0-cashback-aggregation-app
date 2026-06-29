# PocketBase на Dockploy — Фаза 1

## 1. Создать приложение

Dockploy → **Project** → **Create Service** → **Docker** (не Database).

| Поле | Значение |
|------|----------|
| **Name** | `pocketbase` |
| **Image** | `jasonc/pocketbase:latest` (не ghcr.io — blocked на RU VPS) |
| **Command** | **пусто** (образ стартует сам; custom command ломает Swarm) |
| **Port** | `8090` |

### Volume (обязательно)

| Mount path | Size |
|------------|------|
| `/pb/pb_data` | 1 GB |

Без volume данные пропадут при рестарте.

### Domain

| Host | Port |
|------|------|
| `pb.cashbackbrain.ru` | 8090 |

Enable HTTPS (Let's Encrypt).

---

## 2. Первый вход

1. Открыть `https://pb.cashbackbrain.ru/_/`
2. Создать **superadmin** (email + password) — сохранить в менеджер паролей
3. Settings → **Application** → **Allowed origins** (production):
   - `https://cashbackbrain.ru`
   - `http://localhost:3000`
   Development (`pb-dev.cashbackbrain.ru`):
   - `https://dev.cashbackbrain.ru`
   - `http://localhost:3000`

### Auth (Settings → Auth)

- Min password length: **8**
- Email verification: **выключено** (MVP)
- Token duration: **604800** (7 дней)

---

## 3. Коллекции и импорт (из репозитория)

На локальной машине (креды в `.env.pocketbase`):

```bash
python3 scripts/setup_pocketbase_phase1.py
```

Или только re-import каталога:

```bash
POCKETBASE_ENV_FILE=.env.pocketbase python3 scripts/setup_pocketbase.py --import-catalog
```

Скрипт:
- создаёт `retailer_catalog` и `saved_matrices` с API rules
- импортирует **146** записей из `backend/data/retailer_catalog.json`

Проверка в Admin UI: Collections → `retailer_catalog` → Records.

---

## 4. Env для FastAPI

См. [`backend/DOKPLOY.md`](../backend/DOKPLOY.md) и `backend/dokploy.env.example`.

```env
POCKETBASE_URL=https://pb.cashbackbrain.ru
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...
ASSETS_URL=https://1mh89t7nqb.cdn.twcstorage.ru
ADMIN_KEY=...   # openssl rand -hex 16
```

Проверка: `python3 scripts/setup_backend_phase3.py`

---

## 5. Локальная разработка (опционально)

```bash
cd pocketbase
docker compose up -d
# Admin UI: http://localhost:8090/_/
```

Затем тот же `setup_pocketbase.py` с `POCKETBASE_URL=http://localhost:8090`.

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| `health` не отвечает | Проверить port 8090 и command с `--dir=/pb/pb_data` |
| CORS при login с фронта | Добавить origin в PocketBase Settings |
| Import 401 | Проверить admin email/password |
| Collection already exists | Скрипт idempotent — пропускает существующие |

---

## Автодеплой через Dockploy API (опционально)

Полный стек (dev или prod):

```bash
cp dokploy.env.example .env.dokploy
set -a && source .env.dokploy && set +a
python3 scripts/deploy_environment_dokploy.py development
python3 scripts/deploy_environment_dokploy.py production
```

Только PocketBase:

```bash
DOKPLOY_TARGET=development python3 scripts/deploy_pocketbase_dokploy.py
```

### Куда вписать ключ

**Вариант 1 — файл (удобно для повторных запусков)**

```bash
cp pocketbase/dokploy.env.example .env.dokploy
# откройте .env.dokploy и вставьте DOKPLOY_API_KEY=...
set -a && source .env.dokploy && set +a
python3 scripts/deploy_pocketbase_dokploy.py
```

Файл `.env.dokploy` в корне проекта — в `.gitignore`, в репозиторий не попадёт.

**Вариант 2 — только в терминале (разово)**

```bash
export DOKPLOY_URL=https://dokploy.cashbackbrain.ru
export DOKPLOY_API_KEY=ваш_новый_ключ
python3 scripts/deploy_pocketbase_dokploy.py
```

При создании ключа в Dockploy включите права **Create Services** и доступ к API.

**Починка через API** (контейнеры застряли в `created`, 502):

```bash
set -a && source .env.dokploy && set +a
python3 scripts/fix_pocketbase_dokploy.py
```

Скрипт очищает Command, redeploy, проверяет health.

**HTTPS / Let's Encrypt** (если браузер ругается на сертификат или `TRAEFIK DEFAULT CERT`):

```bash
set -a && source .env.dokploy && set +a
python3 scripts/fix_pocketbase_https_dokploy.py
```

Admin UI PocketBase: `https://pb.cashbackbrain.ru/_/` (корень `/` всегда 404 — это нормально).

Ключ **не коммитить** в git. После деплоя всё равно нужен ручной шаг: superadmin в `https://pb.cashbackbrain.ru/_/`.
