# Auth Testing Strategy — Design Spec

**Date:** 2026-06-29  
**Status:** Approved (brainstorming)  
**Scope:** Hybrid — детальные тест-планы для MVP + заготовки для password reset / MFA / OAuth

## Goal

Полная стратегия тестирования аутентификации CashbackBrain: функциональные, security, automated и manual проверки с фазированным внедрением. Реализация тестовой инфраструктуры — в worktree `feature/auth-testing` от `dev`.

## Decisions

| Topic | Decision |
|-------|----------|
| Scope | Гибрид: MVP детально + ⏸️-заготовки для будущих фич |
| Auth backend | PocketBase (`pb.cashbackbrain.ru`) — bcrypt, rate limit, token management делегированы PB |
| Test environments | Локальный Docker PB для CI/integration; staging для E2E smoke и ZAP |
| Unit/Integration | Vitest (уже в проекте) |
| E2E | Playwright (новое) |
| Подход | Фазированная пирамида (рекомендованный вариант C) |
| Worktree | `.worktrees/auth-testing` на ветке `feature/auth-testing` от `dev` |

### Легенда статусов

| Маркер | Значение |
|--------|----------|
| ✅ | Фаза 1 — реализовать/автоматизировать сейчас |
| 🔜 | Фаза 2 — CI hardening, performance, monitoring |
| ⏸️ | Активировать при появлении фичи |
| N/A | Не применимо к текущему стеку |

---

## 1. Architecture

### 1.1 Test pyramid

```
                    ┌─────────────┐
                    │  Playwright │  5–8 E2E (staging smoke)
                    │    E2E      │
                   ┌┴─────────────┴┐
                   │  Integration   │  15–20 (Docker PB :8090)
                   │  auth.pb.test  │
                  ┌┴───────────────┴┐
                  │   Vitest unit    │  30+ (auth-errors, validation)
                  │  lib/*.test.ts   │
                  └──────────────────┘
```

### 1.2 Responsibility boundaries

| Слой | Что тестируем | Что делегируем PocketBase |
|------|---------------|---------------------------|
| Frontend (`lib/auth-*`, `AuthScreen`) | Валидация UI, error mapping, guest overlay flow | — |
| PocketBase API | `authWithPassword`, `create`, `authRefresh` | bcrypt hash, SQL injection protection, built-in rate limit |
| Infra | HTTPS, CORS | TLS termination на Dockploy |

### 1.3 File structure (new)

```
lib/auth-errors.test.ts           # unit
lib/auth-validation.test.ts       # unit (extract validation from context)
lib/auth-context.test.ts          # unit with mocked PB
tests/integration/auth.pb.test.ts # against Docker PB
e2e/auth.spec.ts                  # Playwright guest + login flows
e2e/auth-a11y.spec.ts             # 🔜 phase 2: axe-core
docs/superpowers/checklists/      # manual security + a11y checklists
playwright.config.ts
```

### 1.4 npm scripts (new)

```json
{
  "test": "vitest run",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test",
  "test:e2e:staging": "PLAYWRIGHT_BASE_URL=https://cashbackbrain.ru playwright test",
  "test:auth": "vitest run lib/auth && vitest run tests/integration/auth",
  "security:audit": "npm audit --audit-level=high"
}
```

ZAP baseline (фаза 2):

```bash
docker run -t owasp/zap2docker-stable zap-baseline.py -t https://cashbackbrain.ru
```

### 1.5 Integration test setup

```bash
docker compose -f pocketbase/docker-compose.yml up -d
# First run: create superadmin, then:
python scripts/setup_pocketbase_phase1.py
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090 pnpm test:integration
```

---

## 2. MVP Test Matrix (Phase 1)

### 2.1 Field validation — login / register

| Test | Status | Where | How |
|------|--------|-------|-----|
| Email: invalid format (`foo`, `a@`, `@b.com`) | ✅ | Vitest + Playwright | `type="email"` + PB 400 |
| Email: length > 255 | ✅ | Integration | PB field max |
| Email: special chars (`user+tag@domain.co`) | ✅ | Integration | valid registration |
| Email: SQL injection (`' OR 1=1--`) | ✅ | Integration | PB parameterized queries → 400, not 500 |
| Password < 8 chars | ✅ | Vitest + Playwright | client `minLength` + `register()` guard |
| Password: only digits / only letters | ✅ | Integration | PB min rules (currently length only) |
| Password: max length (72+ bcrypt limit) | ✅ | Integration | PB truncate/reject behavior |
| Empty fields | ✅ | Playwright | HTML `required` blocks submit |
| Unicode/emoji in email | ✅ | Integration | document actual PB behavior |
| XSS in input (`<script>alert(1)</script>`) | ✅ | Playwright | React escape → text in DOM, no execution |

### 2.2 Login scenarios

| Test | Status | How |
|------|--------|-----|
| Successful login | ✅ | Integration + E2E staging |
| Wrong password | ✅ | Integration; message via `formatAuthError` |
| Non-existent email | ✅ | Integration; **same message** as wrong password |
| Brute force lockout (N attempts) | 🔜 | PB rate limit; verify defaults + configure |
| Rate limiting 429 | 🔜 | Integration; `STATUS_MESSAGES[429]` in `auth-errors.ts` |
| CAPTCHA after N failures | ⏸️ | not in PB MVP; Cloudflare Turnstile when added |

**Enumeration protection (critical MVP):**

- PB returns `"Invalid login credentials"` for both wrong email and wrong password
- Vitest: `formatAuthError` must **not** leak raw `data.email` with "not found" text
- Manual: UI must not distinguish "email doesn't exist" vs "wrong password"

### 2.3 Security — data protection

| Test | Status | How |
|------|--------|-----|
| HTTPS on prod | ✅ | Manual/curl: `pb.cashbackbrain.ru`, `cashbackbrain.ru` |
| Password not in logs/Network tab | ✅ | Playwright: PB SDK body; no plain text in console |
| Password hashing (bcrypt) | ✅ | PB Admin → user record: hash, not plaintext |
| HttpOnly/Secure cookies | ✅ | PB token in `localStorage` — document XSS risk |
| SameSite cookies | ⏸️ | relevant if switching to cookie-based session |
| HSTS headers | 🔜 | curl staging/prod |

### 2.4 Security — attacks

| Test | Status | How |
|------|--------|-----|
| SQL injection in login/password | ✅ | Integration payloads → 400 |
| NoSQL injection | N/A | SQLite in PB, not MongoDB |
| XSS reflected/stored | ✅ | Playwright DOM check |
| Credential stuffing protection | 🔜 | PB rate limit + failed login monitoring |
| Session fixation | ✅ | Integration: new token after `authWithPassword` ≠ old |
| Session hijacking | 🔜 | token rotation on refresh; manual review |

### 2.5 Session management

| Test | Status | How |
|------|--------|-----|
| Token expiry (7 days / 604800s) | ✅ | Integration; PB config in `setup_pocketbase_phase1.py` |
| Logout destroys session | ✅ | E2E: `authStore.isValid === false` |
| Token rotation after login | ✅ | Integration: token changes |
| Concurrent sessions limit | ⏸️ | PB allows multiple devices; no app limit until product decision |
| Secure token storage | ✅ | E2E: `localStorage` key `pocketbase_auth` |

### 2.6 Guest-first flow (CashbackBrain-specific)

| Test | Status | How |
|------|--------|-----|
| Start without auth gate | ✅ | Playwright: empty screen, no forced login |
| Full OCR flow as guest | ✅ | E2E staging (or mock OCR) |
| «Войти, чтобы сохранить результат» → AuthScreen | ✅ | Playwright |
| Guest banner on results → dismiss → login | ✅ | Playwright |
| After login — return to same screen, in-memory data preserved | ✅ | Playwright |
| Logout → empty screen, state reset | ✅ | Playwright |

### 2.7 Registration (MVP)

| Test | Status | How |
|------|--------|-----|
| Email uniqueness | ✅ | Integration: duplicate → 400 |
| Password confirm mismatch | ✅ | Vitest `register()` |
| Auto-login after register | ✅ | **Current behavior**: `authWithPassword` after `create` — test as-is |
| Email verification | ⏸️ | `authRule` empty; tests when enabled |
| Password strength meter | ⏸️ | UI not implemented |
| Disposable email blocking | ⏸️ | not implemented |
| Terms & Privacy acceptance | ⏸️ | no checkbox |
| Registration rate limiting | 🔜 | PB defaults |

### 2.8 Error handling

#### Client-side

| Test | Status | How |
|------|--------|-----|
| Real-time field validation | 🔜 | onBlur/onChange in `AuthScreen` (currently submit-only) |
| Clear Russian error messages | ✅ | Vitest `formatAuthError` cases |
| ARIA `role="alert"` on errors | ✅ | Playwright `getByRole('alert')` |
| Keyboard navigation (Tab, Enter) | ✅ | Playwright |
| Mobile viewport 375px | ✅ | Playwright `devices['iPhone 13']` |

#### Server-side

| Test | Status | How |
|------|--------|-----|
| Validation duplicated on PB | ✅ | Integration: bypass client via API |
| Content-Type validation | ✅ | Integration: `text/plain` → 400 |
| Request size limits | 🔜 | oversized payload test |
| HTTP 400/401/403/429 | ✅ | Vitest `STATUS_MESSAGES` + integration |

#### Error message policy

| Rule | Status |
|------|--------|
| Generic messages for login failures | ✅ |
| No stack traces in production | ✅ manual: Next.js prod build |
| Server-side error logging | 🔜 phase 2: PB logs + optional Sentry |
| `X-RateLimit-*` headers | 🔜 when rate limit configured |

---

## 3. Future Features (activate on implementation)

### 3.1 Password Reset ⏸️

PocketBase API: `requestPasswordReset` / `confirmPasswordReset`. UI not implemented.

| Category | Tests |
|----------|-------|
| Functional | request by email; cryptographically secure token; TTL 15–60 min; single-use; rate limit; new password complexity |
| Security | generic «if email exists…»; HTTPS reset link; invalidate all sessions; email notification; Host header validation |
| Edge cases | resend; expired/used/invalid token; non-existent email; multiple requests → only last token valid |

**Files when activated:** `e2e/password-reset.spec.ts`, `tests/integration/password-reset.pb.test.ts`

### 3.2 MFA ⏸️

PB `mfa.enabled: false` in `setup_pocketbase_phase1.py`.

| Test | Tool |
|------|------|
| TOTP enrollment + login | Playwright + `otpauth` test vectors |
| Backup codes (single-use) | Integration |
| SMS codes + rate limit | ⏸️ if added outside PB |
| MFA bypass attempts | Security manual |

### 3.3 OAuth / Social Login ⏸️

PB `oauth2.enabled: false`.

| Test | How |
|------|-----|
| State parameter validation | Integration with mock OAuth server |
| Redirect URI whitelist | Manual + ZAP |
| Token exchange security | Integration |
| Account linking (email collision) | Integration edge case |

### 3.4 Advanced security ⏸️

| Feature | Tests when activated |
|---------|---------------------|
| Device fingerprinting | Integration + anomaly alerts |
| Geolocation / impossible travel | Manual policy review |
| Have I Been Pwned API | Integration on register/password change |
| Account lockout policies | Integration + monitoring |

---

## 4. Automated Test Suites

### 4.1 Unit tests (Vitest) — Phase 1 ✅

| Module | Cases |
|--------|-------|
| `lib/auth-errors.ts` | 400/403/404/429 mapping; field errors; unknown error fallback |
| `lib/auth-validation.ts` | email trim; password min 8; confirm match |
| `lib/auth-context.tsx` | mock PB: login success/fail, register guards, logout |

### 4.2 Integration tests — Phase 1 ✅

| Suite | Cases |
|-------|-------|
| `tests/integration/auth.pb.test.ts` | register → login → refresh → logout; duplicate email; invalid credentials; enumeration-safe messages; SQL injection payloads |

### 4.3 E2E (Playwright) — Phase 1 ✅

| Spec | Cases |
|------|-------|
| `e2e/auth.spec.ts` | guest flow; login overlay from empty/menu/banner; register; logout; session persist on refresh |
| `e2e/auth-a11y.spec.ts` | 🔜 phase 2: axe-core WCAG 2.1 AA scan |

### 4.4 Security scanning — Phase 2 🔜

| Tool | When | Scope |
|------|------|-------|
| OWASP ZAP baseline | pre-release | staging auth endpoints |
| `npm audit` / Dependabot | every PR | dependencies |
| Semgrep SAST | phase 2 | `lib/auth-*`, `auth-screen.tsx` |
| SQLMap | manual pentest | auth API endpoints |

---

## 5. Performance & Load — Phase 2 🔜

| Metric | Target | Tool |
|--------|--------|------|
| Login API p95 | < 200ms | k6 on `pb.cashbackbrain.ru/api/collections/users/auth-with-password` |
| 50 concurrent users | no 5xx | k6 |
| Session cache | N/A MVP | PB internal |

---

## 6. Compliance & Privacy

| Requirement | Status | MVP action |
|-------------|--------|------------|
| GDPR: right to deletion | ⏸️ | PB Admin API delete user; UI later |
| NIST password policy | ✅ | min 8 chars; strengthen with MFA |
| Data retention policy | 🔜 | document in privacy policy |
| Privacy policy link | ⏸️ | footer/menu when legal text ready |
| Consent management | ⏸️ | with Terms checkbox |

---

## 7. Monitoring & Logging — Phase 2 🔜

| Event | Where |
|-------|-------|
| Failed login attempts | PocketBase logs + optional webhook |
| Password reset requests | ⏸️ when feature ships |
| Suspicious activity (N fails/IP) | PB rate limit + alerts |
| Security audit trail | PB Admin UI |
| Real-time dashboard | optional: Grafana/Datadog |

---

## 8. Manual Checklists

### 8.1 Pre-release security (Phase 1)

- [ ] HTTPS on all auth endpoints (frontend + PB)
- [ ] CORS: only `cashbackbrain.ru` + `localhost:3000`
- [ ] No passwords in browser DevTools Network/Console
- [ ] Login error messages identical for wrong email vs wrong password
- [ ] Logout clears `pocketbase_auth` from localStorage
- [ ] `npm audit --audit-level=high` passes
- [ ] Cross-browser: Chromium + WebKit (Playwright)
- [ ] Mobile 375px: auth overlay usable

### 8.2 OWASP Top 10 auth scope (Phase 1 manual)

| OWASP | Check |
|-------|-------|
| A01 Broken Access Control | guest cannot access `saved_matrices` without auth |
| A02 Cryptographic Failures | HTTPS + bcrypt via PB |
| A03 Injection | SQL injection payloads → 400 |
| A04 Insecure Design | enumeration-safe errors |
| A05 Security Misconfiguration | PB MFA/OAuth off until configured |
| A07 Identification Failures | session invalidation on logout |
| A09 Logging Failures | failed logins visible in PB admin |

---

## 9. Acceptance Criteria by Phase

### Phase 1 — gate before merge `feature/auth-testing`

| Criterion | Target |
|-----------|--------|
| Unit test coverage `lib/auth-*` | ≥ 80% |
| Integration suite vs Docker PB | 100% pass |
| E2E smoke on staging | 5 critical scenarios green |
| OWASP auth-scope manual checklist | passed |
| Known vulns in deps | `npm audit --audit-level=high` = 0 |
| Accessibility | keyboard nav + `role="alert"` |
| Mobile responsive | Playwright 375px |
| Cross-browser | Chromium + WebKit |

### Phase 2 — CI hardening

| Criterion | Target |
|-----------|--------|
| Auth module coverage | ≥ 95% |
| ZAP baseline | 0 High alerts on auth routes |
| GitHub Actions | unit + integration on every PR |
| Login p95 latency | < 200ms |

### Phase 3+ — per feature

Activate corresponding ⏸️ sections and add acceptance criteria from §3.

---

## 10. Implementation Notes

### Worktree setup

```bash
git fetch origin
git worktree add .worktrees/auth-testing -b feature/auth-testing dev
cd .worktrees/auth-testing
pnpm install
docker compose -f pocketbase/docker-compose.yml up -d
```

### Tools reference

| Purpose | Tool |
|---------|------|
| Security testing | Burp Suite / OWASP ZAP |
| API testing | Postman/Newman (optional) |
| E2E | Playwright |
| Load testing | k6 / JMeter |
| SQL injection | SQLMap (manual pentest) |
| Password policy review | manual + PB config |

### Out of scope for this spec

- Implementing auth features (password reset UI, MFA, OAuth)
- PostgreSQL / custom JWT backend
- Persisting guest banner dismiss across sessions

---

## 11. Test plan (manual smoke — Phase 1)

1. Open app as guest → empty screen, no auth gate
2. Complete screenshot flow to results without login
3. «Войти, чтобы сохранить результат» → AuthScreen → login → return to empty
4. Guest menu → «Войти / создать аккаунт» → auth
5. Results as guest → «Сохранить кешбэки?» banner → login → banner gone
6. Dismiss banner with ✕ → hidden until reload
7. Logout → empty, state cleared
8. Register new user → auto-login → refresh → session persists
9. Wrong password → generic error, no email enumeration
10. `pnpm test:auth` and `pnpm test:e2e:staging` green
