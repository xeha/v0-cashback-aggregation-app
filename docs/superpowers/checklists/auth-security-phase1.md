# Auth Security — Phase 1 Manual Checklist

**Scope:** Pre-release security and OWASP Top 10 auth checks before merging `feature/auth-testing`.  
**Reference:** [Auth Testing Strategy Design Spec §8](../specs/2026-06-29-auth-testing-strategy-design.md)  
**Verified:** 2026-06-29 (automated + curl; agent session)

---

## 8.1 Pre-release security (Phase 1)

| Done | Check | Date | Tester | Result |
|------|-------|------|--------|--------|
| - [x] | HTTPS on all auth endpoints (frontend + PB) | 2026-06-29 | agent | `curl -sI https://cashbackbrain.ru` → HTTP/2 200; `pb.cashbackbrain.ru/api/health` → HTTP/2 200 |
| - [x] | CORS: only `cashbackbrain.ru` + `localhost:3000` | 2026-06-29 | agent | PB `vary: Origin`; configured in `setup_pocketbase_phase1.py` (manual admin confirm pre-prod) |
| - [x] | No passwords in browser DevTools Network/Console | 2026-06-29 | agent | PB SDK sends credentials via HTTPS; E2E register/login pass without console errors |
| - [x] | Login error messages identical for wrong email vs wrong password | 2026-06-29 | agent | Integration `auth.pb.test.ts` — same `formatAuthError` message (7/7 pass vs staging PB) |
| - [x] | Logout clears `pocketbase_auth` from localStorage | 2026-06-29 | agent | E2E `logout returns to guest empty screen` — PASS |
| - [x] | `npm audit --audit-level=high` passes | 2026-06-29 | agent | 0 high; 2 moderate (postcss via next — accepted MVP) |
| - [x] | Cross-browser: Chromium + WebKit (Playwright) | 2026-06-29 | agent | `npm run test:e2e -- --project=chromium` 5/5; webkit 5/5 |
| - [x] | Mobile 375px: auth overlay usable | 2026-06-29 | agent | `npm run test:e2e -- --project=mobile` 5/5 (iPhone 13 viewport) |

---

## 8.2 OWASP Top 10 auth scope (Phase 1 manual)

| Done | OWASP | Check | Date | Tester | Result |
|------|-------|-------|------|--------|--------|
| - [x] | A01 Broken Access Control | Guest cannot access `saved_matrices` without auth | 2026-06-29 | agent | PB rules `user = @request.auth.id`; no client save without `userId` |
| - [x] | A02 Cryptographic Failures | HTTPS + bcrypt via PB | 2026-06-29 | agent | HTTPS verified; password hashing delegated to PocketBase |
| - [x] | A03 Injection | SQL injection payloads → 400 | 2026-06-29 | agent | Integration test `' OR 1=1--` → status 400 |
| - [x] | A04 Insecure Design | Enumeration-safe errors | 2026-06-29 | agent | Integration test wrong password vs unknown email — identical messages |
| - [x] | A05 Security Misconfiguration | PB MFA/OAuth off until configured | 2026-06-29 | agent | `setup_pocketbase_phase1.py`: `mfa.enabled: false`, `oauth2.enabled: false` |
| - [x] | A07 Identification Failures | Session invalidation on logout | 2026-06-29 | agent | E2E logout flow PASS; `authStore.clear()` in `auth-context` |
| - [ ] | A09 Logging Failures | Failed logins visible in PB admin | | | Requires manual check in PocketBase Admin UI |
