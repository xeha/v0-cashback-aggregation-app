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
         ▼ PR dev → main (только после «да»)
    merge ──▶ Dokploy production ──▶ cashbackbrain.ru
```

## Правило деплоя (обязательно)

**Сначала development, потом production — всегда.**

1. Код попадает в ветку **`dev`** и деплоится в Dokploy **Environment: development**.
2. Проверяем на dev-доменах (см. таблицу выше).
3. **Только после успешной проверки и явного согласия** — merge в `main` и деплой **Environment: production**.

**Нельзя** деплоить в production, пока изменения не проверены на development — даже через UI Dokploy (кнопка Deploy у приложения в production).

### Как не перепутать окружение в UI

| Действие | Development (нужно для теста) | Production (только после «да») |
|----------|-------------------------------|--------------------------------|
| Environment в проекте | `development` | `production` |
| Ветка Git | `dev` | `main` |
| FastAPI | `api-dev.cashbackbrain.ru` | `api.cashbackbrain.ru` |
| Frontend | `dev.cashbackbrain.ru` | `cashbackbrain.ru` |

Путь в UI: **Projects → CashbackBrain → выбрать `development` в переключателе Environment → сервис → Deploy**.

На странице **Deployments** смотрите колонку **Environment** — `production` в строке означает прод-деплой.

Подробнее для агентов: [`.cursor/rules/deploy-git-workflow.mdc`](.cursor/rules/deploy-git-workflow.mdc).

## Dev-стек по запросу (RAM)

VPS: **8 GB RAM**. Production 24/7. Development **stopped**, когда не тестируем.

| Режим | RAM (оценка) |
|-------|----------------|
| Штатный (prod only) | ~2.0–2.5 GB |
| Dev-тест (prod + dev) | ~4.0–4.5 GB |

```bash
# Перед тестом на dev
python3 scripts/toggle_dev_stack.py start --wait-health
FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py

# После теста / после deploy development
python3 scripts/toggle_dev_stack.py stop
python3 scripts/toggle_dev_stack.py status
```

После deploy development (авто-stop опционально):

```bash
DEV_STACK_AUTO_STOP=1 python3 scripts/deploy_environment_dokploy.py development
```

Spec: [`docs/superpowers/specs/2026-06-29-dev-stack-memory-design.md`](docs/superpowers/specs/2026-06-29-dev-stack-memory-design.md)

### Timeweb VPS (RAM, бэкапы диска)

```bash
cp timeweb.env.example .env.timeweb   # TIMEWEB_CLOUD_TOKEN
python3 scripts/timeweb_server_status.py status
python3 scripts/timeweb_server_status.py backups
python3 scripts/timeweb_server_status.py backup-create --comment "before deploy"
```

## Быстрый деплой

```bash
cp dokploy.env.example .env.dokploy   # DOKPLOY_API_KEY
# backend/.env — MISTRAL_API_KEY, POCKETBASE_*, ADMIN_KEY

set -a && source .env.dokploy && set +a

# Development (ветка dev)
python3 scripts/deploy_environment_dokploy.py development

# Production (ветка main) — ТОЛЬКО после проверки на dev и явного согласия
# python3 scripts/deploy_environment_dokploy.py production
```

Отдельные сервисы:

```bash
DOKPLOY_TARGET=development python3 scripts/deploy_frontend_dokploy.py
# Production — только после merge dev→main и согласия:
# DOKPLOY_TARGET=production python3 scripts/deploy_fastapi_dokploy.py
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
