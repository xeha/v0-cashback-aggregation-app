# Dokploy — два окружения (development + production)

Архитектура по [лекции 7](https://github.com): ветка `dev` → dev-стенд, ветка `main` → production.

## Домены

| Сервис | Development | Production |
|--------|-------------|------------|
| Панель Dokploy | `dokploy.cashbackbrain.ru` | (общая) |
| Frontend | `dev.cashbackbrain.ru` | `cashbackbrain.ru` |
| FastAPI | `api-dev.cashbackbrain.ru` | `api.cashbackbrain.ru` |
| PocketBase | `pb-dev.cashbackbrain.ru` | `pb.cashbackbrain.ru` |

DNS: A-записи `dev`, `api-dev`, `pb-dev`, `@`, `api`, `pb`, `dokploy` → IP сервера.

## Workflow

```
dev ──push──▶ Dokploy development ──▶ тест на dev.cashbackbrain.ru
         │
         ▼ PR dev → main
    merge ──▶ Dokploy production ──▶ cashbackbrain.ru
```

## Быстрый деплой

```bash
cp dokploy.env.example .env.dokploy   # DOKPLOY_API_KEY
# backend/.env — MISTRAL_API_KEY, POCKETBASE_*, ADMIN_KEY

set -a && source .env.dokploy && set +a

# Development (ветка dev)
python3 scripts/deploy_environment_dokploy.py development

# Production (ветка main)
python3 scripts/deploy_environment_dokploy.py production
```

Отдельные сервисы:

```bash
DOKPLOY_TARGET=development python3 scripts/deploy_frontend_dokploy.py
DOKPLOY_TARGET=production python3 scripts/deploy_fastapi_dokploy.py
```

## После первого dev-деплоя PocketBase

1. Superadmin: `https://pb-dev.cashbackbrain.ru/_/`
2. Креды в `.env.pocketbase.dev` (локально, не в git)
3. `POCKETBASE_URL=https://pb-dev.cashbackbrain.ru python3 scripts/setup_pocketbase.py --import-catalog`
4. `FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py`

## Профили

См. `scripts/dokploy_common.py` → `DEPLOY_PROFILES`.

Каждое окружение Dokploy — отдельный **Environment** в проекте `CashbackBrain` со своими приложениями и volume PocketBase.

### Development (создано 2026-06-28)

| Сервис | appId | Домен |
|--------|-------|-------|
| PocketBase | `TJLMTHwQTtE8Qw9jzsehJ` | `pb-dev.cashbackbrain.ru` |
| FastAPI | `xmQBvNSxw4xjfEbPmxlR3` | `api-dev.cashbackbrain.ru` |
| Frontend | `dRpUgqUmQomxUb63Sc4rh` | `dev.cashbackbrain.ru` |

Environment id: `PBM-xAngzTQwyL8_8rxQi`

После сборки контейнеров (5–15 мин):

```bash
set -a && source .env.dokploy && source .env.pocketbase && set +a
python3 scripts/setup_dev_post_deploy.py
```

## Локальный DNS (если Timeweb ещё не пропагировал)

```bash
sudo ./scripts/setup-local-dns.sh
```

См. также: [`backend/DOKPLOY.md`](backend/DOKPLOY.md), [`pocketbase/DOKPLOY.md`](pocketbase/DOKPLOY.md).
