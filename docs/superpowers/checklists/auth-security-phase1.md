# Auth Security — Phase 1 Manual Checklist

**Scope:** Pre-release security and OWASP Top 10 auth checks before merging `feature/auth-testing`.  
**Reference:** [Auth Testing Strategy Design Spec §8](../specs/2026-06-29-auth-testing-strategy-design.md)

---

## 8.1 Pre-release security (Phase 1)

| Done | Check | Date | Tester | Result |
|------|-------|------|--------|--------|
| - [ ] | HTTPS on all auth endpoints (frontend + PB) | | | |
| - [ ] | CORS: only `cashbackbrain.ru` + `localhost:3000` | | | |
| - [ ] | No passwords in browser DevTools Network/Console | | | |
| - [ ] | Login error messages identical for wrong email vs wrong password | | | |
| - [ ] | Logout clears `pocketbase_auth` from localStorage | | | |
| - [ ] | `npm audit --audit-level=high` passes | | | |
| - [ ] | Cross-browser: Chromium + WebKit (Playwright) | | | |
| - [ ] | Mobile 375px: auth overlay usable | | | |

---

## 8.2 OWASP Top 10 auth scope (Phase 1 manual)

| Done | OWASP | Check | Date | Tester | Result |
|------|-------|-------|------|--------|--------|
| - [ ] | A01 Broken Access Control | Guest cannot access `saved_matrices` without auth | | | |
| - [ ] | A02 Cryptographic Failures | HTTPS + bcrypt via PB | | | |
| - [ ] | A03 Injection | SQL injection payloads → 400 | | | |
| - [ ] | A04 Insecure Design | Enumeration-safe errors | | | |
| - [ ] | A05 Security Misconfiguration | PB MFA/OAuth off until configured | | | |
| - [ ] | A07 Identification Failures | Session invalidation on logout | | | |
| - [ ] | A09 Logging Failures | Failed logins visible in PB admin | | | |
