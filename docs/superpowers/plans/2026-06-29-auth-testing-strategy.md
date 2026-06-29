# Auth Testing Strategy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED before Task 1:** Use superpowers:using-git-worktrees — вся реализация только в worktree, не в корневом checkout.

**Goal:** Внедрить фазу 1 тестовой пирамиды auth: Vitest unit, integration против Docker PocketBase, Playwright E2E smoke, manual checklists.

**Architecture:** Валидация выносится в `lib/auth-validation.ts`; unit-тесты мокают PocketBase SDK; integration ходит в локальный PB `:8090` с `describe.skipIf`; E2E гоняет Next.js dev + локальный PB (staging — опционально pre-release). Manual checklists — markdown в `docs/superpowers/checklists/`.

**Tech Stack:** Vitest 4, Playwright, PocketBase SDK 0.27, Docker Compose (`pocketbase/docker-compose.yml`).

**Spec:** [`docs/superpowers/specs/2026-06-29-auth-testing-strategy-design.md`](../specs/2026-06-29-auth-testing-strategy-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/auth-validation.ts` | Pure register input validation (extract from context) |
| `lib/auth-errors.test.ts` | Unit: `formatAuthError` mapping |
| `lib/auth-validation.test.ts` | Unit: validation rules |
| `lib/auth-context.test.ts` | Unit: login/register/logout with mocked PB |
| `tests/integration/helpers/pocketbase-test-env.ts` | PB health check, unique email factory |
| `tests/integration/auth.pb.test.ts` | Integration: real PB auth API |
| `playwright.config.ts` | E2E: chromium, webkit, iPhone 13 |
| `e2e/auth.spec.ts` | Guest flow + login overlay + logout |
| `e2e/fixtures/auth.ts` | Register/login helpers for E2E |
| `docs/superpowers/checklists/auth-security-phase1.md` | Manual OWASP + pre-release |
| `vitest.config.ts` | Include `tests/integration/**/*.test.ts` |
| `vitest.integration.config.ts` | Optional isolated integration config |
| `package.json` | `test:integration`, `test:e2e`, `test:auth`, `security:audit` |

---

## Task 0: Worktree + feature branch (ОБЯЗАТЕЛЬНО ПЕРВЫМ)

**Все изменения кода — только в worktree. Корневой checkout не трогать.**

**Files:** none (git only)

- [ ] **Step 1: Verify worktrees ignored**

```bash
cd /path/to/v0-cashback-aggregation-app
git check-ignore -q .worktrees && echo "OK: ignored"
```

Expected: `OK: ignored`

- [ ] **Step 2: Fetch and create worktree from `dev`**

```bash
git fetch origin
git worktree add .worktrees/auth-testing -b feature/auth-testing origin/dev
cd .worktrees/auth-testing
```

Expected: `Preparing worktree` + checkout on `feature/auth-testing`

- [ ] **Step 3: Bring spec + plan into feature branch**

```bash
git cherry-pick 789a10f   # auth testing design spec (adjust SHA if needed)
git merge main --no-edit  # or cherry-pick plan commit after it lands on main
```

- [ ] **Step 4: Install deps + baseline tests**

```bash
pnpm install
pnpm test
```

Expected: existing vitest suites pass (3 files in `lib/`)

- [ ] **Step 5: Start local PocketBase for later tasks**

```bash
docker compose -f pocketbase/docker-compose.yml up -d
curl -sf http://127.0.0.1:8090/api/health
```

Expected: HTTP 200

- [ ] **Step 6: Commit (empty baseline marker — optional)**

```bash
git status   # must show feature/auth-testing, clean after installs
```

**Checkpoint:** дальнейшие Tasks 1–11 выполняются только из `.worktrees/auth-testing/`.

---

## Task 1: Vitest config — integration include

**Files:**
- Modify: `vitest.config.ts`
- Create: `vitest.integration.config.ts`

- [ ] **Step 1: Extend main vitest config**

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/auth-*.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
```

- [ ] **Step 2: Add integration config**

`vitest.integration.config.ts`:

```typescript
import { defineConfig, mergeConfig } from "vitest/config"
import base from "./vitest.config"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/integration/**/*.test.ts"],
      testTimeout: 30_000,
      hookTimeout: 30_000,
      fileParallelism: false,
    },
  }),
)
```

- [ ] **Step 3: Verify unit tests still pass**

```bash
pnpm test
```

Expected: PASS (3 existing test files)

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts vitest.integration.config.ts
git commit -m "test: extend vitest config for auth coverage and integration"
```

---

## Task 2: Unit tests — `formatAuthError`

**Files:**
- Create: `lib/auth-errors.test.ts`
- Create: `lib/test-utils/pocketbase-error.ts`

- [ ] **Step 1: Write PocketBase error factory**

`lib/test-utils/pocketbase-error.ts`:

```typescript
import { ClientResponseError } from "pocketbase"

export function makeClientResponseError(
  status: number,
  data?: Record<string, unknown>,
): ClientResponseError {
  return new ClientResponseError({
    url: "http://127.0.0.1:8090/api/collections/users/auth-with-password",
    status,
    response: data ? { data } : {},
    isAbort: false,
    originalError: null,
  })
}
```

- [ ] **Step 2: Write failing tests**

`lib/auth-errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { formatAuthError } from "@/lib/auth-errors"
import { makeClientResponseError } from "@/lib/test-utils/pocketbase-error"

describe("formatAuthError", () => {
  it("returns PB message when present", () => {
    const error = makeClientResponseError(400, {
      message: "Invalid login credentials.",
    })
    expect(formatAuthError(error)).toBe("Invalid login credentials.")
  })

  it("maps 429 to Russian rate limit message", () => {
    const error = makeClientResponseError(429)
    expect(formatAuthError(error)).toBe("Слишком много попыток. Попробуйте позже")
  })

  it("maps 403 and 404", () => {
    expect(formatAuthError(makeClientResponseError(403))).toBe("Доступ запрещён")
    expect(formatAuthError(makeClientResponseError(404))).toBe("Сервис авторизации недоступен")
  })

  it("returns field email error", () => {
    const error = makeClientResponseError(400, {
      email: { message: "Некорректный email." },
    })
    expect(formatAuthError(error)).toBe("Некорректный email.")
  })

  it("returns field password error", () => {
    const error = makeClientResponseError(400, {
      password: { message: "Слишком короткий пароль." },
    })
    expect(formatAuthError(error)).toBe("Слишком короткий пароль.")
  })

  it("does not leak enumeration for generic 400", () => {
    const error = makeClientResponseError(400)
    expect(formatAuthError(error)).toBe("Проверьте введённые данные")
  })

  it("wraps native Error", () => {
    expect(formatAuthError(new Error("Пароли не совпадают"))).toBe("Пароли не совпадают")
  })

  it("fallback for unknown values", () => {
    expect(formatAuthError(null)).toBe("Произошла ошибка. Попробуйте снова")
  })
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm vitest run lib/auth-errors.test.ts
```

Expected: PASS (implementation already exists)

- [ ] **Step 4: Commit**

```bash
git add lib/auth-errors.test.ts lib/test-utils/pocketbase-error.ts
git commit -m "test: add unit tests for formatAuthError"
```

---

## Task 3: Extract `auth-validation` + unit tests

**Files:**
- Create: `lib/auth-validation.ts`
- Create: `lib/auth-validation.test.ts`
- Modify: `lib/auth-context.tsx`

- [ ] **Step 1: Write failing validation tests**

`lib/auth-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { validateRegisterInput } from "@/lib/auth-validation"

describe("validateRegisterInput", () => {
  it("trims email on success", () => {
    const result = validateRegisterInput("  user@example.com  ", "password1", "password1")
    expect(result).toEqual({ ok: true, email: "user@example.com" })
  })

  it("rejects password shorter than 8 chars", () => {
    const result = validateRegisterInput("user@example.com", "short", "short")
    expect(result).toEqual({
      ok: false,
      message: "Пароль должен быть не короче 8 символов",
    })
  })

  it("rejects mismatched passwords", () => {
    const result = validateRegisterInput("user@example.com", "password1", "password2")
    expect(result).toEqual({ ok: false, message: "Пароли не совпадают" })
  })

  it("rejects empty email", () => {
    const result = validateRegisterInput("   ", "password1", "password1")
    expect(result).toEqual({ ok: false, message: "Введите email" })
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm vitest run lib/auth-validation.test.ts
```

Expected: FAIL — `validateRegisterInput` not found

- [ ] **Step 3: Implement validation module**

`lib/auth-validation.ts`:

```typescript
export type RegisterValidationResult =
  | { ok: true; email: string }
  | { ok: false; message: string }

export function validateRegisterInput(
  email: string,
  password: string,
  passwordConfirm: string,
): RegisterValidationResult {
  const trimmedEmail = email.trim()

  if (!trimmedEmail) {
    return { ok: false, message: "Введите email" }
  }

  if (password.length < 8) {
    return { ok: false, message: "Пароль должен быть не короче 8 символов" }
  }

  if (password !== passwordConfirm) {
    return { ok: false, message: "Пароли не совпадают" }
  }

  return { ok: true, email: trimmedEmail }
}
```

- [ ] **Step 4: Wire into `auth-context.tsx`**

Replace inline checks in `register`:

```typescript
import { validateRegisterInput } from "@/lib/auth-validation"

// inside register callback:
const validation = validateRegisterInput(email, password, passwordConfirm)
if (!validation.ok) {
  throw new Error(validation.message)
}
const trimmedEmail = validation.email
```

Remove duplicate `password.length` and `password !== passwordConfirm` blocks.

- [ ] **Step 5: Run tests**

```bash
pnpm vitest run lib/auth-validation.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/auth-validation.ts lib/auth-validation.test.ts lib/auth-context.tsx
git commit -m "refactor: extract register validation + unit tests"
```

---

## Task 4: Unit tests — `auth-context` with mocked PB

**Files:**
- Create: `lib/auth-context.test.ts`

- [ ] **Step 1: Write tests with vi.mock**

`lib/auth-context.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import type { ReactNode } from "react"
import { AuthProvider, useAuth } from "@/lib/auth-context"

const authWithPassword = vi.fn()
const create = vi.fn()
const authRefresh = vi.fn()
const clear = vi.fn()
const onChange = vi.fn()

vi.mock("@/lib/pocketbase", () => ({
  createPocketBase: () => ({
    authStore: {
      record: null,
      isValid: false,
      onChange,
      clear,
    },
    collection: () => ({
      authWithPassword,
      create,
      authRefresh,
    }),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe("useAuth register", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws validation error before hitting PB", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      result.current.register("a@b.com", "short", "short"),
    ).rejects.toThrow("Пароль должен быть не короче 8 символов")

    expect(create).not.toHaveBeenCalled()
  })

  it("creates user then logs in on success", async () => {
    create.mockResolvedValue({})
    authWithPassword.mockResolvedValue({})

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.register("user@example.com", "password1", "password1")
    })

    expect(create).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password1",
      passwordConfirm: "password1",
    })
    expect(authWithPassword).toHaveBeenCalledWith("user@example.com", "password1")
  })
})
```

- [ ] **Step 2: Install testing-library**

```bash
pnpm add -D @testing-library/react @testing-library/dom jsdom
```

- [ ] **Step 3: Add jsdom environment for this file only**

At top of `lib/auth-context.test.ts`:

```typescript
// @vitest-environment jsdom
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run lib/auth-context.test.ts
```

Expected: PASS after mock adjustments if needed

- [ ] **Step 5: Commit**

```bash
git add lib/auth-context.test.ts package.json pnpm-lock.yaml
git commit -m "test: add auth-context unit tests with mocked PocketBase"
```

---

## Task 5: Integration harness — PocketBase test env

**Files:**
- Create: `tests/integration/helpers/pocketbase-test-env.ts`

- [ ] **Step 1: Create helper**

`tests/integration/helpers/pocketbase-test-env.ts`:

```typescript
import PocketBase from "pocketbase"

export const POCKETBASE_TEST_URL =
  process.env.POCKETBASE_TEST_URL ?? "http://127.0.0.1:8090"

export async function isPocketBaseReady(): Promise<boolean> {
  try {
    const response = await fetch(`${POCKETBASE_TEST_URL}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

export function createTestPocketBase(): PocketBase {
  return new PocketBase(POCKETBASE_TEST_URL)
}

export function uniqueTestEmail(prefix = "auth-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cashbackbrain.test`
}

export const TEST_PASSWORD = "TestPass123!"
```

- [ ] **Step 2: Commit**

```bash
git add tests/integration/helpers/pocketbase-test-env.ts
git commit -m "test: add PocketBase integration test helpers"
```

---

## Task 6: Integration tests — `auth.pb.test.ts`

**Files:**
- Create: `tests/integration/auth.pb.test.ts`

- [ ] **Step 1: Write integration suite**

`tests/integration/auth.pb.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest"
import { ClientResponseError } from "pocketbase"
import { formatAuthError } from "@/lib/auth-errors"
import {
  createTestPocketBase,
  isPocketBaseReady,
  uniqueTestEmail,
  TEST_PASSWORD,
  POCKETBASE_TEST_URL,
} from "./helpers/pocketbase-test-env"

const pbReady = await isPocketBaseReady()

describe.skipIf(!pbReady)("PocketBase auth integration", () => {
  beforeAll(() => {
    if (!pbReady) {
      console.warn(`PocketBase not reachable at ${POCKETBASE_TEST_URL} — skipping integration tests`)
    }
  })

  it("registers, logs in, refreshes, logs out", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail()

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    const login = await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    expect(login.token).toBeTruthy()
    expect(pb.authStore.isValid).toBe(true)

    const refreshed = await pb.collection("users").authRefresh()
    expect(refreshed.token).toBeTruthy()

    pb.authStore.clear()
    expect(pb.authStore.isValid).toBe(false)
  })

  it("rejects duplicate email", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail()

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    await expect(
      pb.collection("users").create({
        email,
        password: TEST_PASSWORD,
        passwordConfirm: TEST_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(ClientResponseError)
  })

  it("returns same error for wrong password and unknown email", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail()

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })
    pb.authStore.clear()

    let wrongPasswordMessage = ""
    let unknownEmailMessage = ""

    try {
      await pb.collection("users").authWithPassword(email, "WrongPass99!")
    } catch (error) {
      wrongPasswordMessage = formatAuthError(error)
    }

    try {
      await pb.collection("users").authWithPassword("missing@cashbackbrain.test", TEST_PASSWORD)
    } catch (error) {
      unknownEmailMessage = formatAuthError(error)
    }

    expect(wrongPasswordMessage).toBeTruthy()
    expect(wrongPasswordMessage).toBe(unknownEmailMessage)
  })

  it("rejects SQL injection payloads with 400", async () => {
    const pb = createTestPocketBase()

    await expect(
      pb.collection("users").authWithPassword("' OR 1=1--", TEST_PASSWORD),
    ).rejects.toMatchObject({ status: 400 })
  })

  it("accepts email with plus addressing", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail("plus").replace("@", "+tag@")

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    const login = await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    expect(login.record?.email).toBe(email)
  })

  it("rotates token on login", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail("rotate")

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    const first = await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    pb.authStore.clear()

    const second = await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    expect(second.token).toBeTruthy()
    expect(second.token).not.toBe(first.token)
  })
})
```

- [ ] **Step 2: Run integration tests**

```bash
docker compose -f pocketbase/docker-compose.yml up -d
pnpm vitest run --config vitest.integration.config.ts
```

Expected: PASS (6 tests) or SKIP if PB down

- [ ] **Step 3: Commit**

```bash
git add tests/integration/auth.pb.test.ts
git commit -m "test: add PocketBase auth integration suite"
```

---

## Task 7: Playwright setup

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `.gitignore` (add `playwright-report/`, `test-results/`)

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium webkit
```

- [ ] **Step 2: Create config**

`playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        env: {
          NEXT_PUBLIC_POCKETBASE_URL:
            process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "http://127.0.0.1:8090",
          NEXT_PUBLIC_BACKEND_URL:
            process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000",
        },
      },
})
```

- [ ] **Step 3: Add npm scripts**

`package.json` scripts:

```json
"test:integration": "vitest run --config vitest.integration.config.ts",
"test:e2e": "playwright test",
"test:e2e:staging": "PLAYWRIGHT_BASE_URL=https://cashbackbrain.ru playwright test",
"test:auth": "vitest run lib/auth-errors.test.ts lib/auth-validation.test.ts lib/auth-context.test.ts && pnpm test:integration",
"security:audit": "pnpm audit --audit-level=high"
```

- [ ] **Step 4: Update `.gitignore`**

```
playwright-report/
test-results/
blob-report/
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts package.json pnpm-lock.yaml .gitignore
git commit -m "test: add Playwright scaffolding and auth npm scripts"
```

---

## Task 8: E2E — guest flow + auth overlay

**Files:**
- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/auth.spec.ts`

- [ ] **Step 1: Auth fixture**

`e2e/fixtures/auth.ts`:

```typescript
import { expect, type Page } from "@playwright/test"
import { uniqueTestEmail, TEST_PASSWORD } from "../../tests/integration/helpers/pocketbase-test-env"

export async function registerViaUi(page: Page): Promise<{ email: string; password: string }> {
  const email = uniqueTestEmail("e2e")
  const password = TEST_PASSWORD

  await page.getByRole("button", { name: "Регистрация" }).click()
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.locator('input[autocomplete="new-password"]').first().fill(password)
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(password)
  await page.getByRole("button", { name: "Создать аккаунт" }).click()

  await expect(page.getByRole("button", { name: "Создать аккаунт" })).not.toBeVisible({
    timeout: 15_000,
  })

  return { email, password }
}

export async function openAuthFromEmpty(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Войти, чтобы сохранить результат" }).click()
  await expect(page.getByRole("heading", { name: "CashbackBrain" })).toBeVisible()
}
```

- [ ] **Step 2: Write E2E spec**

`e2e/auth.spec.ts`:

```typescript
import { test, expect } from "@playwright/test"
import { openAuthFromEmpty, registerViaUi } from "./fixtures/auth"

test.describe("guest-first auth", () => {
  test("shows empty screen without auth gate", async ({ page }) => {
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: "Собери кешбэки в одном месте" }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Войти" })).not.toBeVisible()
  })

  test("opens auth overlay from empty screen link", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await expect(page.getByRole("button", { name: "Вход" })).toBeVisible()
  })

  test("registers and closes overlay", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await registerViaUi(page)
    await expect(page.getByRole("button", { name: "Войти, чтобы сохранить результат" })).not.toBeVisible()
  })

  test("shows alert on wrong password", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await page.getByPlaceholder("you@example.com").fill("nobody@cashbackbrain.test")
    await page.locator('input[autocomplete="current-password"]').fill("WrongPass99!")
    await page.getByRole("button", { name: "Войти" }).click()
    await expect(page.getByRole("alert")).toBeVisible()
  })

  test("logout returns to guest empty screen", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await registerViaUi(page)

    await page.getByRole("button", { name: "Открыть меню" }).click()
    await page.getByRole("button", { name: "Выйти" }).click()
    await page.getByRole("button", { name: "Выйти" }).click()

    await expect(
      page.getByRole("button", { name: "Войти, чтобы сохранить результат" }),
    ).toBeVisible()
  })
})
```

- [ ] **Step 3: Add `data-testid` only if selectors fail**

If menu button lacks accessible name, add to `user-menu.tsx`:

```tsx
aria-label="Открыть меню"
```

on the menu trigger button — only if Playwright cannot find it.

- [ ] **Step 4: Run E2E (local)**

```bash
docker compose -f pocketbase/docker-compose.yml up -d
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090 pnpm test:e2e --project=chromium
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/ components/screens/user-menu.tsx
git commit -m "test: add Playwright auth E2E smoke tests"
```

---

## Task 9: Manual security checklists

**Files:**
- Create: `docs/superpowers/checklists/auth-security-phase1.md`

- [ ] **Step 1: Create checklist from spec §8**

`docs/superpowers/checklists/auth-security-phase1.md` — copy sections 8.1 and 8.2 from design spec as markdown checkboxes with `Date tested / Tester / Result` columns.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/checklists/auth-security-phase1.md
git commit -m "docs: add phase 1 auth security manual checklist"
```

---

## Task 10: Coverage gate + final verification

**Files:**
- Modify: `package.json` (add `@vitest/coverage-v8`)

- [ ] **Step 1: Install coverage**

```bash
pnpm add -D @vitest/coverage-v8
```

- [ ] **Step 2: Run full auth test suite**

```bash
pnpm test:auth
pnpm vitest run --coverage lib/auth-errors.test.ts lib/auth-validation.test.ts lib/auth-context.test.ts
```

Expected: ≥ 80% lines on `lib/auth-errors.ts`, `lib/auth-validation.ts`

- [ ] **Step 3: Security audit**

```bash
pnpm security:audit
```

Expected: exit 0 (no high vulnerabilities)

- [ ] **Step 4: Lint + build**

```bash
pnpm lint
pnpm build
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "test: add auth coverage reporting"
```

---

## Task 11: Merge readiness

**Files:** none

- [ ] **Step 1: Run full pre-merge checklist**

```bash
cd .worktrees/auth-testing
pnpm test:auth
pnpm test:e2e --project=chromium
pnpm test:e2e --project=webkit
pnpm test:e2e --project=mobile
pnpm security:audit
pnpm lint && pnpm build
```

- [ ] **Step 2: Manual checklist**

Complete `docs/superpowers/checklists/auth-security-phase1.md` (HTTPS, CORS, enumeration).

- [ ] **Step 3: Push feature branch**

```bash
git push -u origin feature/auth-testing
```

- [ ] **Step 4: Open PR `feature/auth-testing` → `dev`**

PR body must include:
- Spec link
- `pnpm test:auth` output
- E2E screenshot or Playwright report
- Manual checklist status

---

## Phase 2 backlog (не в этом плане)

| Item | Trigger |
|------|---------|
| GitHub Actions CI | отдельный план после merge фазы 1 |
| OWASP ZAP baseline | pre-release на staging |
| `e2e/auth-a11y.spec.ts` + axe-core | фаза 2 |
| k6 load tests | фаза 2 |
| Password reset / MFA / OAuth tests | при реализации фич (см. spec §3) |

---

## Spec coverage self-review

| Spec section | Task |
|--------------|------|
| §2.1 Field validation | Tasks 3, 6, 8 |
| §2.2 Login scenarios | Tasks 2, 6, 8 |
| §2.3–2.5 Security/session | Tasks 6, 9 (manual HTTPS/bcrypt) |
| §2.6 Guest-first flow | Task 8 |
| §2.7 Registration | Tasks 3, 6, 8 |
| §2.8 Error handling | Tasks 2, 8 |
| §4.1–4.3 Automated suites | Tasks 2–8 |
| §8 Manual checklists | Task 9 |
| §9 Phase 1 acceptance | Task 10–11 |
| §3 Future features ⏸️ | Phase 2 backlog table |
| §5–7 Performance/compliance/monitoring 🔜 | Phase 2 backlog |
