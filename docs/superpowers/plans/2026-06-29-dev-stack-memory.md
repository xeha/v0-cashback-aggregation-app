# Dev Stack On-Demand + VPS Memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Стабилизировать production на VPS 8 GB: dev-стек (PocketBase + FastAPI + Frontend) поднимается только на время тестирования через `toggle_dev_stack.py`.

**Architecture:** Production Environment в Dokploy работает 24/7. Development Environment по умолчанию stopped. Скрипт вызывает Dokploy API `application.start` / `application.stop` в правильном порядке зависимостей. Memory limit 1536m на FastAPI-контейнеры — ручная настройка в Dokploy UI.

**Tech Stack:** Python 3.11, Dokploy REST API (`x-api-key`), существующие helpers в `scripts/dokploy_common.py`.

**Spec:** [`docs/superpowers/specs/2026-06-29-dev-stack-memory-design.md`](../specs/2026-06-29-dev-stack-memory-design.md)

---

## File Map

### New files
- `scripts/toggle_dev_stack.py` — start/stop/status dev-стека через Dokploy API
- `scripts/test_toggle_dev_stack.py` — unit-тесты чистых helper-функций (без сети)

### Modified files
- `DOKPLOY.md` — секция «Dev-стек по запросу», memory budget
- `.cursor/rules/deploy-git-workflow.mdc` — шаги start/stop в workflow
- `backend/DOKPLOY.md` — RAM-требования, memory limit
- `scripts/deploy_environment_dokploy.py` — после development-деплоя напоминание + опциональный auto-stop

---

## Task 1: VPS Upgrade (manual, blocking)

> Выполняется владельцем сервера до или параллельно с кодом.

- [ ] **Step 1: Апгрейд RAM в Timeweb**

  1. Панель Timeweb → VPS → Тариф → изменить RAM **4 → 8 GB**
  2. Reboot сервера (если не автоматический)
  3. SSH: `free -h` — должно показать ~7.8 Gi total

  Expected:
  ```
  total        used        free
  7.8Gi       2.0Gi       5.0Gi   (примерно, зависит от текущих контейнеров)
  ```

- [ ] **Step 2: Проверить prod после reboot**

  ```bash
  curl -s https://api.cashbackbrain.ru/health | python3 -m json.tool
  ```

  Expected: `"status": "ok"`, `"mapper_loaded": true`

---

## Task 2: `toggle_dev_stack.py` — helpers + tests

**Files:**
- Create: `scripts/test_toggle_dev_stack.py`
- Create: `scripts/toggle_dev_stack.py` (часть 1 — helpers)

- [ ] **Step 1: Write failing tests for helpers**

  Create `scripts/test_toggle_dev_stack.py`:

  ```python
  from __future__ import annotations

  import sys
  import unittest
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).resolve().parent))

  from toggle_dev_stack import (
      RUNNING_STATUSES,
      START_ORDER,
      STOP_ORDER,
      is_running,
      service_order,
  )


  class ToggleDevStackHelpersTest(unittest.TestCase):
      def test_start_order(self) -> None:
          self.assertEqual(START_ORDER, ("pocketbase", "fastapi", "frontend"))

      def test_stop_order_is_reverse(self) -> None:
          self.assertEqual(STOP_ORDER, tuple(reversed(START_ORDER)))

      def test_is_running_done(self) -> None:
          self.assertTrue(is_running("done"))

      def test_is_running_idle(self) -> None:
          self.assertFalse(is_running("idle"))

      def test_is_running_none(self) -> None:
          self.assertFalse(is_running(None))

      def test_service_order_start(self) -> None:
          self.assertEqual(service_order("start"), START_ORDER)

      def test_service_order_stop(self) -> None:
          self.assertEqual(service_order("stop"), STOP_ORDER)


  if __name__ == "__main__":
      unittest.main()
  ```

- [ ] **Step 2: Run tests — verify FAIL**

  ```bash
  cd /path/to/repo && python3 scripts/test_toggle_dev_stack.py -v
  ```

  Expected: `ModuleNotFoundError: No module named 'toggle_dev_stack'`

- [ ] **Step 3: Implement helpers in `scripts/toggle_dev_stack.py`**

  Create file with constants and pure functions (остальной код — в Task 3):

  ```python
  from __future__ import annotations

  START_ORDER = ("pocketbase", "fastapi", "frontend")
  STOP_ORDER = tuple(reversed(START_ORDER))
  RUNNING_STATUSES = frozenset({"done", "running"})


  def is_running(status: str | None) -> bool:
      if not status:
          return False
      return status.strip().lower() in RUNNING_STATUSES


  def service_order(action: str) -> tuple[str, ...]:
      if action == "start":
          return START_ORDER
      if action == "stop":
          return STOP_ORDER
      raise ValueError(f"Unknown action: {action!r}")
  ```

- [ ] **Step 4: Run tests — verify PASS**

  ```bash
  python3 scripts/test_toggle_dev_stack.py -v
  ```

  Expected: `OK` (6 tests)

---

## Task 3: `toggle_dev_stack.py` — full CLI

**Files:**
- Modify: `scripts/toggle_dev_stack.py` (дополнить CLI, Dokploy calls, health waits)

- [ ] **Step 1: Add complete script body**

  Replace/extend `scripts/toggle_dev_stack.py` with full implementation:

  ```python
  #!/usr/bin/env python3
  """Start/stop CashbackBrain development stack in Dokploy (on-demand dev testing).

  Usage:
    python3 scripts/toggle_dev_stack.py status
    python3 scripts/toggle_dev_stack.py start
    python3 scripts/toggle_dev_stack.py stop
    python3 scripts/toggle_dev_stack.py start --wait-health

  Requires .env.dokploy (DOKPLOY_URL, DOKPLOY_API_KEY).
  """
  from __future__ import annotations

  import argparse
  import json
  import os
  import sys
  import time
  import urllib.error
  import urllib.request
  from dataclasses import dataclass
  from pathlib import Path
  from typing import Any

  sys.path.insert(0, str(Path(__file__).resolve().parent))

  from dokploy_common import (
      DokployClient,
      application_id,
      apply_deploy_profile,
      find_app_by_name,
      find_environment_id,
      load_dokploy_env,
      require_env,
  )

  START_ORDER = ("pocketbase", "fastapi", "frontend")
  STOP_ORDER = tuple(reversed(START_ORDER))
  RUNNING_STATUSES = frozenset({"done", "running"})

  HEALTH_CHECKS: dict[str, tuple[str, dict[str, Any] | None]] = {
      "pocketbase": ("https://pb-dev.cashbackbrain.ru/api/health", None),
      "fastapi": (
          "https://api-dev.cashbackbrain.ru/health",
          {"status": "ok", "mapper_loaded": True},
      ),
      "frontend": ("https://dev.cashbackbrain.ru", None),
  }

  START_SLEEP_SEC = 8
  HEALTH_TIMEOUT_SEC = 600
  HEALTH_POLL_SEC = 15


  def is_running(status: str | None) -> bool:
      if not status:
          return False
      return status.strip().lower() in RUNNING_STATUSES


  def service_order(action: str) -> tuple[str, ...]:
      if action == "start":
          return START_ORDER
      if action == "stop":
          return STOP_ORDER
      raise ValueError(f"Unknown action: {action!r}")


  @dataclass(frozen=True)
  class DevApp:
      name: str
      app_id: str
      status: str


  def resolve_dev_apps(client: DokployClient) -> dict[str, DevApp]:
      environment_id = find_environment_id(client)
      apps: dict[str, DevApp] = {}
      for name in START_ORDER:
          found = find_app_by_name(client, environment_id, name)
          if not found:
              raise RuntimeError(
                  f"Development app {name!r} not found in environment {environment_id}. "
                  "Run deploy_environment_dokploy.py development first."
              )
          app_id = application_id(found)
          status = str(found.get("applicationStatus") or "unknown")
          apps[name] = DevApp(name=name, app_id=app_id, status=status)
      return apps


  def refresh_status(client: DokployClient, app: DevApp) -> DevApp:
      payload = client.get("application.one", {"applicationId": app.app_id})
      status = str(payload.get("applicationStatus") or "unknown") if isinstance(payload, dict) else "unknown"
      return DevApp(name=app.name, app_id=app.app_id, status=status)


  def start_app(client: DokployClient, app: DevApp) -> DevApp:
      app = refresh_status(client, app)
      if is_running(app.status):
          print(f"  {app.name}: already running ({app.status})")
          return app
      print(f"  {app.name}: starting ({app.app_id})…")
      client.post("application.start", {"applicationId": app.app_id})
      time.sleep(START_SLEEP_SEC)
      return refresh_status(client, app)


  def stop_app(client: DokployClient, app: DevApp) -> DevApp:
      app = refresh_status(client, app)
      if not is_running(app.status):
          print(f"  {app.name}: already stopped ({app.status})")
          return app
      print(f"  {app.name}: stopping ({app.app_id})…")
      try:
          client.post("application.stop", {"applicationId": app.app_id})
      except RuntimeError as exc:
          print(f"  {app.name}: stop warning: {exc}")
      time.sleep(START_SLEEP_SEC)
      return refresh_status(client, app)


  def cmd_status(client: DokployClient) -> int:
      apps = resolve_dev_apps(client)
      print("Development stack status:")
      for name in START_ORDER:
          app = refresh_status(client, apps[name])
          state = "running" if is_running(app.status) else "stopped"
          print(f"  {name:12} {state:8} ({app.status})  id={app.app_id}")
      return 0


  def cmd_start(client: DokployClient, *, wait_health: bool) -> int:
      apps = resolve_dev_apps(client)
      print("Starting development stack…")
      for name in START_ORDER:
          apps[name] = start_app(client, apps[name])
          print(f"  {name}: {apps[name].status}")

      if not wait_health:
          print("Done. Use --wait-health to poll HTTPS endpoints.")
          return 0

      print()
      print("Waiting for health checks…")
      for name in START_ORDER:
          url, expected_subset = HEALTH_CHECKS[name]
          wait_url_health(name, url, expected_subset)
      print("All health checks passed.")
      return 0


  def cmd_stop(client: DokployClient) -> int:
      apps = resolve_dev_apps(client)
      print("Stopping development stack…")
      for name in STOP_ORDER:
          apps[name] = stop_app(client, apps[name])
          print(f"  {name}: {apps[name].status}")
      print("Done.")
      return 0


  def wait_url_health(name: str, url: str, expected_subset: dict[str, Any] | None) -> None:
      deadline = time.time() + HEALTH_TIMEOUT_SEC
      last_error = "timeout"
      while time.time() < deadline:
          try:
              with urllib.request.urlopen(url, timeout=15) as resp:
                  body = resp.read().decode("utf-8", errors="replace")
                  if expected_subset is not None:
                      data = json.loads(body)
                      if all(data.get(k) == v for k, v in expected_subset.items()):
                          print(f"  {name}: OK {url}")
                          return
                      last_error = f"unexpected body: {body[:200]}"
                  elif 200 <= resp.status < 300:
                      print(f"  {name}: OK {url} (HTTP {resp.status})")
                      return
                  else:
                      last_error = f"HTTP {resp.status}"
          except urllib.error.HTTPError as exc:
              last_error = f"HTTP {exc.code}"
          except Exception as exc:
              last_error = str(exc)
          print(f"  {name}: waiting {url} … ({last_error})")
          time.sleep(HEALTH_POLL_SEC)
      raise RuntimeError(f"Health check failed for {name} ({url}): {last_error}")


  def main() -> None:
      parser = argparse.ArgumentParser(description="Toggle CashbackBrain development stack in Dokploy")
      parser.add_argument(
          "action",
          choices=("status", "start", "stop"),
          help="status | start | stop",
      )
      parser.add_argument(
          "--wait-health",
          action="store_true",
          help="After start, poll pb-dev / api-dev / dev frontend health",
      )
      args = parser.parse_args()

      load_dokploy_env()
      apply_deploy_profile("development")
      client = DokployClient(require_env("DOKPLOY_URL"), require_env("DOKPLOY_API_KEY"))

      if args.action == "status":
          raise SystemExit(cmd_status(client))
      if args.action == "start":
          raise SystemExit(cmd_start(client, wait_health=args.wait_health))
      if args.action == "stop":
          raise SystemExit(cmd_stop(client))


  if __name__ == "__main__":
      main()
  ```

- [ ] **Step 2: Make executable and run unit tests**

  ```bash
  chmod +x scripts/toggle_dev_stack.py
  python3 scripts/test_toggle_dev_stack.py -v
  ```

  Expected: 6 tests PASS

- [ ] **Step 3: Dry-run status against Dokploy**

  ```bash
  set -a && source .env.dokploy && set +a
  python3 scripts/toggle_dev_stack.py status
  ```

  Expected: три строки `pocketbase`, `fastapi`, `frontend` с appId из spec

---

## Task 4: Auto-stop hint after development deploy

**Files:**
- Modify: `scripts/deploy_environment_dokploy.py`

- [ ] **Step 1: Add post-deploy reminder for development target**

  В конце `main()` в `scripts/deploy_environment_dokploy.py`, после успешного деплоя, добавить:

  ```python
      if target == "development":
          print()
          print("Development deploy finished.")
          print("  Stop dev stack when not testing (saves RAM on VPS):")
          print("    python3 scripts/toggle_dev_stack.py stop")
          print("  Before next test:")
          print("    python3 scripts/toggle_dev_stack.py start --wait-health")
          if os.environ.get("DEV_STACK_AUTO_STOP", "").strip() in ("1", "true", "yes"):
              print()
              print("DEV_STACK_AUTO_STOP=1 — stopping development stack…")
              subprocess.run(
                  [sys.executable, str(Path(__file__).resolve().parent / "toggle_dev_stack.py"), "stop"],
                  check=False,
              )
  ```

  Добавить импорты `subprocess` и `Path` если ещё нет.

- [ ] **Step 2: Verify script still runs (syntax)**

  ```bash
  python3 -m py_compile scripts/deploy_environment_dokploy.py scripts/toggle_dev_stack.py
  ```

  Expected: no output (success)

---

## Task 5: Documentation updates

**Files:**
- Modify: `DOKPLOY.md`
- Modify: `.cursor/rules/deploy-git-workflow.mdc`
- Modify: `backend/DOKPLOY.md`

- [ ] **Step 1: Update `DOKPLOY.md`**

  После секции «Workflow» вставить:

  ```markdown
  ## Dev-стек по запросу (RAM)

  VPS: **8 GB RAM**. Production 24/7. Development **stopped** когда не тестируем.

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
  ```

  После deploy development (авто-stop опционально):

  ```bash
  DEV_STACK_AUTO_STOP=1 python3 scripts/deploy_environment_dokploy.py development
  ```

  Spec: [`docs/superpowers/specs/2026-06-29-dev-stack-memory-design.md`](docs/superpowers/specs/2026-06-29-dev-stack-memory-design.md)
  ```

- [ ] **Step 2: Update `.cursor/rules/deploy-git-workflow.mdc`**

  В «Обязательный порядок», между шагами 2 и 3:

  ```markdown
  2a. Поднять dev-стек (если stopped):
      ```bash
      python3 scripts/toggle_dev_stack.py start --wait-health
      ```
  ```

  После шага 6:

  ```markdown
  6a. Остановить dev-стек (освободить RAM):
      ```bash
      python3 scripts/toggle_dev_stack.py stop
      ```
  ```

- [ ] **Step 3: Update `backend/DOKPLOY.md`**

  После таблицы «Два окружения» добавить:

  ```markdown
  ### Память (VPS)

  - Рекомендуемый VPS: **8 GB RAM**
  - FastAPI с `sentence-transformers`: ~800 MB–1.2 GB на инстанс
  - Dev FastAPI не должен работать 24/7 — `python3 scripts/toggle_dev_stack.py stop`
  - Memory limit в Dokploy UI: **1536m** на FastAPI (dev + prod)
  ```

---

## Task 6: Server stabilization (manual)

> После merge в `dev` и deploy скриптов.

- [ ] **Step 1: Stop dev stack**

  ```bash
  set -a && source .env.dokploy && set +a
  python3 scripts/toggle_dev_stack.py stop
  python3 scripts/toggle_dev_stack.py status
  ```

  Expected: все три сервиса `stopped (idle)`

- [ ] **Step 2: Check RAM baseline (SSH on VPS)**

  ```bash
  free -h
  docker stats --no-stream
  ```

  Expected: used < 3 GiB в штатном режиме

- [ ] **Step 3: Full dev test cycle**

  ```bash
  python3 scripts/toggle_dev_stack.py start --wait-health
  FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_e2e_phase5.py
  python3 scripts/toggle_dev_stack.py stop
  free -h
  ```

  Expected: e2e passes; after stop RAM returns near baseline

- [ ] **Step 4: Set FastAPI memory limits in Dokploy UI**

  Для **обоих** FastAPI (development + production):

  1. Projects → CashbackBrain → Environment → FastAPI → Advanced
  2. Memory limit: `1536` MB (или `mem_limit: 1536m` в compose settings)
  3. Save / Redeploy не требуется для лимита — только restart контейнера

---

## Task 7: Commit

- [ ] **Step 1: Commit on `dev` branch**

  ```bash
  git add scripts/toggle_dev_stack.py scripts/test_toggle_dev_stack.py \
    scripts/deploy_environment_dokploy.py \
    DOKPLOY.md backend/DOKPLOY.md .cursor/rules/deploy-git-workflow.mdc \
    docs/superpowers/specs/2026-06-29-dev-stack-memory-design.md \
    docs/superpowers/plans/2026-06-29-dev-stack-memory.md
  git commit -m "$(cat <<'EOF'
Add dev stack toggle script to prevent VPS OOM from dual FastAPI ML instances.

Dev environment starts on demand via Dokploy API; docs cover 8GB RAM workflow.
EOF
)"
  ```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| VPS 8 GB upgrade | Task 1 |
| `toggle_dev_stack.py` start/stop/status | Tasks 2–3 |
| Start order PB → FastAPI → Frontend | Task 3 (`START_ORDER`) |
| `--wait-health` | Task 3 |
| Dokploy `application.start/stop` | Task 3 |
| Docs: DOKPLOY, workflow, backend | Task 5 |
| Stabilization checklist | Task 6 |
| Memory limit 1536m | Task 6 Step 4 (manual UI) |
| After dev deploy → stop | Task 4 + Task 5 |
| Out of scope (no ML changes) | — |
