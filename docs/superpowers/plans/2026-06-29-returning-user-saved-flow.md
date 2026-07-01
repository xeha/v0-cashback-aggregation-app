# Returning User Saved Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Авторизованный пользователь видит карточку «Продолжить» на empty (вариант B), список сохранений в «Кешбэк-профиль» (вариант D), может открыть/редактировать и пересохранять в PocketBase.

**Architecture:** Расширить `lib/saved-matrices.ts` (list/get/update + summary helpers). `CashbackApp` держит `activeSaveId`, `savedSummaries`, fetch при login. UI: `ContinueSaveCard`, обновлённые `EmptyScreen`, `UserMenu`, `ResultsScreen` с create/update веткой.

**Tech Stack:** Next.js 16, React 19, PocketBase SDK, Vitest

**Branch:** `feature/returning-user-saved-flow` (worktree `.worktrees/returning-user-saved-flow`)

**Spec:** `docs/superpowers/specs/2026-06-29-returning-user-saved-flow-design.md`

---

### Task 1: Saved matrices API layer

**Files:**
- Modify: `lib/saved-matrices.ts`
- Create: `lib/saved-matrix-meta.ts`
- Create: `lib/saved-matrix-meta.test.ts`

- [ ] **Step 1:** Добавить типы `SavedMatrixSummary`, `SavedMatrixRecord`, helpers подсчёта провайдеров/категорий, `formatRelativeUpdated`, `formatSaveMetaLine`
- [ ] **Step 2:** Реализовать `listSavedMatrices`, `getSavedMatrix`, `updateSavedMatrix`
- [ ] **Step 3:** Vitest для meta helpers
- [ ] **Step 4:** `npm test -- lib/saved-matrix-meta.test.ts`

### Task 2: Continue card + Empty screen

**Files:**
- Create: `components/screens/continue-save-card.tsx`
- Modify: `components/screens/empty-screen.tsx`

- [ ] **Step 1:** Компонент карточки (skeleton, meta, onContinue)
- [ ] **Step 2:** Пропсы `continueSave`, `onContinueSave`, `savesLoading` в EmptyScreen

### Task 3: UserMenu cashback profile (вариант D)

**Files:**
- Modify: `components/screens/user-menu.tsx`

- [ ] **Step 1:** Пропсы `savedSummaries`, `savesLoading`, `savesError`, `onOpenSaved`, `onNewAssembly`, `onRetrySaves`
- [ ] **Step 2:** Секции «Сохранённые результаты» + «Любимые категории» + «+ Новая сборка»

### Task 4: CashbackApp orchestration

**Files:**
- Modify: `components/cashback-app.tsx`

- [ ] **Step 1:** State + fetch summaries on `user`
- [ ] **Step 2:** `hydrateFromSave`, `handleOpenSaved`, `handleSaveMatrix` (create/update), `refreshSavedSummaries`
- [ ] **Step 3:** Thread props to Empty, Results, UserMenu on all screens

### Task 5: Results screen save button

**Files:**
- Modify: `components/screens/results-screen.tsx`

- [ ] **Step 1:** `activeSaveId`, `onSaveMatrix` props; текст кнопки и toast

### Task 6: Verify

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
