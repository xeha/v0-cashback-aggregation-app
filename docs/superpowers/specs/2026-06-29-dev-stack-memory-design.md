# Dev Stack On-Demand + VPS Memory — Design Spec

**Date:** 2026-06-29  
**Status:** Approved

## Problem

На одном VPS (4 GB RAM) одновременно работают два окружения Dokploy (development + production). Каждый FastAPI-инстанс при старте загружает:

- `sentence-transformers` + PyTorch + модель `paraphrase-multilingual-MiniLM-L12-v2` (~800 MB–1.2 GB)
- in-memory каталоги (`catalog_store`)
- кэш ритейлеров из PocketBase

Два FastAPI с ML + два PocketBase + два Frontend + Dokploy/Traefik → OOM и crash loop.

`MarketSplitMapService` (супермаркеты) **не** использует локальную ML-модель — только Mistral API.

## Goal

Стабилизировать production на том же VPS без отказа от двух веток (`dev`/`main`) и двух Dokploy Environment. Dev-стек поднимается **только на время тестирования**.

## Decisions

| Topic | Decision |
|-------|----------|
| VPS RAM | Апгрейд Timeweb: **4 → 8 GB** (тот же IP, DNS без изменений) |
| Dev-стек | **Stopped по умолчанию**; start/stop через скрипт |
| Prod-стек | **24/7**, не останавливаем во время dev-тестов |
| ML / код маппера | **Не меняем** — модель и embedding-пайплайн остаются |
| Вынос на Railway | **Не делаем** в этой итерации |
| Memory limit FastAPI | `mem_limit: 1536m` на контейнер (dev + prod) — предохранитель |

## Memory Budget (8 GB)

| Режим | Сервисы | Оценка RAM |
|-------|---------|------------|
| **Штатный** | prod FastAPI + prod PB + prod Frontend + Dokploy | ~2.0–2.5 GB |
| **Dev-тест** | штатный prod + dev FastAPI + dev PB + dev Frontend | ~4.0–4.5 GB |
| **Запас** | — | ~3 GB |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  VPS 8 GB — Dokploy (CashbackBrain)                     │
│                                                         │
│  Environment: production (24/7)                         │
│    ├── FastAPI  api.cashbackbrain.ru      [running]     │
│    ├── PocketBase  pb.cashbackbrain.ru    [running]     │
│    └── Frontend  cashbackbrain.ru        [running]      │
│                                                         │
│  Environment: development (on-demand)                   │
│    ├── FastAPI  api-dev.cashbackbrain.ru  [stopped]     │
│    ├── PocketBase  pb-dev.cashbackbrain.ru [stopped]    │
│    └── Frontend  dev.cashbackbrain.ru     [stopped]     │
└─────────────────────────────────────────────────────────┘
```

## Operational Workflow

```
[Штатно]     prod ON, dev OFF
      │
      ▼  push в dev + deploy development
[Тест]       toggle_dev_stack.py start [--wait-health]
             verify на dev-доменах
      │
      ▼  тест OK, merge dev → main (с согласия)
[Прод]       deploy production
             toggle_dev_stack.py stop
[Штатно]     prod ON, dev OFF
```

### Start order (dev)

1. **PocketBase** — FastAPI читает `retailer_catalog` при старте
2. **FastAPI** — ML-модель + каталоги (~30–60 с до `/health`)
3. **Frontend** — зависит от api-dev и pb-dev

### Stop order (dev)

Обратный: Frontend → FastAPI → PocketBase.

### Dokploy API

| Действие | Endpoint |
|----------|----------|
| Остановить | `POST /api/application.stop` `{"applicationId": "..."}` |
| Запустить | `POST /api/application.start` `{"applicationId": "..."}` |

Без полного redeploy. Auth: `x-api-key` (как в существующих скриптах).

## Script: `scripts/toggle_dev_stack.py`

### Commands

```bash
python3 scripts/toggle_dev_stack.py status
python3 scripts/toggle_dev_stack.py start
python3 scripts/toggle_dev_stack.py stop
python3 scripts/toggle_dev_stack.py start --wait-health
```

### Behavior

- `DOKPLOY_TARGET=development` (или аргумент) — профиль из `dokploy_common.py`
- Резолвит appId через `find_app_by_name` в Environment `development` (`pocketbase`, `fastapi`, `frontend`)
- `status` — печатает `applicationStatus` каждого сервиса (`idle` / `done` / …)
- `start` — вызывает `application.start` в порядке PB → FastAPI → Frontend
- `stop` — вызывает `application.stop` в порядке Frontend → FastAPI → PB
- `--wait-health` после start:
  - `https://pb-dev.cashbackbrain.ru/api/health`
  - `https://api-dev.cashbackbrain.ru/health` (`mapper_loaded: true`)
  - `https://dev.cashbackbrain.ru` (HTTP 200)

### Env

Требует `.env.dokploy` (`DOKPLOY_URL`, `DOKPLOY_API_KEY`) — как остальные deploy-скрипты.

## Memory Limits (FastAPI containers)

Через Dokploy Advanced / Docker settings для **обоих** FastAPI-приложений:

```yaml
mem_limit: 1536m
```

При превышении падает контейнер FastAPI, не весь VPS. Настраивается вручную в Dokploy UI при стабилизации (или через API, если поддерживается).

`uvicorn` — **один worker** (уже в `backend/Dockerfile`).

## Stabilization Checklist (one-time)

1. Апгрейд VPS Timeweb 4 → 8 GB, reboot
2. Проверить prod: `curl https://api.cashbackbrain.ru/health`
3. Остановить dev-стек: `python3 scripts/toggle_dev_stack.py stop`
4. `free -h` на сервере — used < 3 GB в штатном режиме
5. Тестовый цикл: `start --wait-health` → `verify_e2e_phase5.py` → `stop`
6. Зафиксировать baseline: `docker stats --no-stream`
7. Установить `mem_limit: 1536m` на FastAPI (dev + prod) в Dokploy

## Documentation Updates

| File | Change |
|------|--------|
| `DOKPLOY.md` | Секция «Dev-стек по запросу», memory budget, чеклист |
| `.cursor/rules/deploy-git-workflow.mdc` | Шаги `toggle_dev_stack.py start/stop` в workflow |
| `backend/DOKPLOY.md` | RAM-требования, memory limit, первый старт ML |

## Integration with Existing Deploy Flow

Деплой dev **не меняется**:

```bash
DOKPLOY_TARGET=development python3 scripts/deploy_environment_dokploy.py
```

После деплоя (особенно первого на 8 GB):

```bash
python3 scripts/toggle_dev_stack.py stop   # не оставлять dev running постоянно
```

Перед тестом:

```bash
python3 scripts/toggle_dev_stack.py start --wait-health
FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py
```

## Error Handling

| Situation | Action |
|-----------|--------|
| `start` при уже running | Идемпотентно — пропустить или сообщить «already running» |
| `stop` при already stopped | Идемпотентно — OK |
| FastAPI health timeout | Подсказка: первый старт 30–60 с (ML load); проверить логи Dokploy |
| OOM после апгрейда | Проверить, что dev stopped; `docker stats`; убедиться в mem_limit |

## Out of Scope

- Отказ от двух веток Git или двух Dokploy Environment
- Вынос FastAPI на Railway / второй VPS
- Замена `sentence-transformers` на Mistral Embeddings API
- Pre-computed embeddings без runtime-модели
- Автоматический cron stop dev (ручной скрипт достаточно для MVP)

## Success Criteria

- [ ] VPS 8 GB, prod healthy 24/7 без crash loop
- [ ] Dev-стек stopped в штатном режиме; `free -h` used < 3 GB
- [ ] `toggle_dev_stack.py start --wait-health` поднимает dev за < 3 мин
- [ ] `verify_e2e_phase5.py` проходит на dev-доменах
- [ ] После `stop` dev RAM возвращается к штатному уровню
- [ ] Документация обновлена

## Known App IDs (development)

| Service | appId |
|---------|-------|
| PocketBase | `TJLMTHwQTtE8Qw9jzsehJ` |
| FastAPI | `xmQBvNSxw4xjfEbPmxlR3` |
| Frontend | `dRpUgqUmQomxUb63Sc4rh` |

Скрипт резолвит по имени; ID — справочно для ручных операций в Dokploy UI.
