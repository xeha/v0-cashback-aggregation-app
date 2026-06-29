# Guest-First Screen + Optional Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Открыть приложение без регистрации, обновить первый экран (копирайт, логотип, ссылка входа), добавить гостевой баннер на results и унифицировать написание «кешбэк» в UI.

**Architecture:** `CashbackApp` всегда рендерит основной screen flow; `AuthScreen` — overlay по `authOpen`. Гость определяется как `!user`. `UserMenu` ветвится по `isGuest`. Баннер на results управляется из `CashbackApp` (`guestBannerDismissed`).

**Tech Stack:** Next.js 16, React 19, TypeScript, Framer Motion, PocketBase auth (`useAuth`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-28-guest-first-screen-design.md`

**Estimated total:** ~3–4 h

---

## File Map

| File | Responsibility |
|------|----------------|
| `components/cashback-app.tsx` | Убрать auth gate; overlay auth; guest banner state; прокинуть `isGuest`, `onLoginRequest` |
| `components/screens/auth-screen.tsx` | `onClose`; обновить копирайт и логотип |
| `components/screens/empty-screen.tsx` | Приветственный экран + ссылка входа |
| `components/screens/user-menu.tsx` | Режим гостя: вход вместо выхода; скрыть профильные пункты |
| `components/screens/guest-save-banner.tsx` | **Create** — баннер «Сохранить кешбэки?» |
| `components/screens/results-screen.tsx` | Вставить баннер; guest props |
| `components/app-logo.tsx` | **Create** — компактный логотип (img/SVG) |
| `public/images/logo-icon.svg` | **Create** — иконка бренда |
| `app/layout.tsx` | Метаданные: «кешбэк» |
| `components/screens/bank-select-screen.tsx` | Орфография |
| `components/duplicate-source-confirm-dialog.tsx` | Орфография |
| `lib/api.ts`, `lib/saved-matrices.ts` | Орфография в сообщениях |

---

### Task 1: App logo component (~20 min)

**Files:**
- Create: `public/images/logo-icon.svg`
- Create: `components/app-logo.tsx`

- [ ] **Step 1: Add SVG icon**

Минимальный жёлтый знак (rounded rect + символ % или упрощённая монета). Пример `public/images/logo-icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="12" fill="#FEF08A"/>
  <text x="24" y="31" text-anchor="middle" font-size="20" font-weight="700" fill="#334155" font-family="system-ui,sans-serif">%</text>
</svg>
```

(При вёрстке можно заменить на crop из `empty-cashback.png`, если ассет доступен.)

- [ ] **Step 2: Create `AppLogo`**

```tsx
"use client"

type AppLogoProps = {
  size?: "sm" | "md" | "lg"
  showName?: boolean
  className?: string
}

const SIZE_CLASS = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-14 w-14" } as const

export function AppLogo({ size = "md", showName = false, className = "" }: AppLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="/images/logo-icon.svg"
        alt=""
        className={`${SIZE_CLASS[size]} shrink-0 rounded-xl object-contain`}
        aria-hidden
      />
      {showName && (
        <span className="text-[15px] font-bold text-slate-900">CashbackBrain</span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add public/images/logo-icon.svg components/app-logo.tsx
git commit -m "feat: add AppLogo component and brand icon"
```

---

### Task 2: Auth overlay + remove auth gate (~45 min)

**Files:**
- Modify: `components/cashback-app.tsx`
- Modify: `components/screens/auth-screen.tsx`

- [ ] **Step 1: Extend `AuthScreen` with close + new copy**

```tsx
export function AuthScreen({ onClose }: { onClose?: () => void }) {
  // ...
  // Header: заменить % span на <AppLogo size="lg" />
  // Subtitle:
  // «Войдите или создайте аккаунт, чтобы сохранять результаты»
  // Top-right optional:
  {onClose && (
    <button type="button" onClick={onClose} aria-label="Закрыть" className="...">
      <X className="h-5 w-5" />
    </button>
  )}
}
```

- [ ] **Step 2: Refactor `CashbackApp`**

Добавить state:

```tsx
const [authOpen, setAuthOpen] = useState(false)
const [guestBannerDismissed, setGuestBannerDismissed] = useState(false)
const isGuest = !user

function openAuth() {
  setAuthOpen(true)
}

useEffect(() => {
  if (user && authOpen) setAuthOpen(false)
}, [user, authOpen])
```

Удалить ветку `!user ? <AuthScreen /> : <ImageFilePicker>`. Всегда рендерить `ImageFilePicker` после `isLoading`.

Поверх phone shell — overlay:

```tsx
<AnimatePresence>
  {authOpen && (
    <motion.div
      key="auth-overlay"
      className="absolute inset-0 z-50 flex flex-col bg-white"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
    >
      <AuthScreen onClose={() => setAuthOpen(false)} />
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 3: Manual check**

`pnpm dev` → без логина сразу empty screen; overlay auth не виден.

- [ ] **Step 4: Commit**

```bash
git add components/cashback-app.tsx components/screens/auth-screen.tsx
git commit -m "feat: guest-first flow with auth overlay"
```

---

### Task 3: Empty screen refresh (~30 min)

**Files:**
- Modify: `components/screens/empty-screen.tsx`

- [ ] **Step 1: Update props and UI**

```tsx
export function EmptyScreen({
  onFilePicked,
  onLogout,
  onLoginRequest,
  isGuest,
  userEmail,
}: {
  onFilePicked: (src: string) => void
  onLogout: () => void
  onLoginRequest: () => void
  isGuest: boolean
  userEmail?: string
}) {
```

Изменения в разметке:
- `UserMenu`: `isGuest={isGuest}` `onLoginRequest={onLoginRequest}`
- После иллюстрации: `<AppLogo showName className="mb-4 justify-center" />`
- H1: `Соберите кешбэки в одном месте`
- Подзаголовок: `Загрузите скриншоты категорий из банков и магазинов`
- alt иллюстрации: `кешбэка`
- Под кнопкой CTA:

```tsx
{isGuest && (
  <button
    type="button"
    onClick={onLoginRequest}
    className="text-[14px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
  >
    Войти, чтобы сохранить результат
  </button>
)}
```

- [ ] **Step 2: Wire props in `cashback-app.tsx`**

```tsx
<EmptyScreen
  isGuest={isGuest}
  onLoginRequest={openAuth}
  onLogout={handleLogout}
  userEmail={...}
  onFilePicked={...}
/>
```

- [ ] **Step 3: Commit**

```bash
git add components/screens/empty-screen.tsx components/cashback-app.tsx
git commit -m "feat: welcome empty screen with optional login link"
```

---

### Task 4: Guest `UserMenu` (~30 min)

**Files:**
- Modify: `components/screens/user-menu.tsx`
- Modify: `components/screens/results-screen.tsx` (props pass-through)

- [ ] **Step 1: Add guest props**

```tsx
export function UserMenu({
  onLogout,
  onLoginRequest,
  isGuest = false,
  userEmail,
  variant = "light",
}: {
  onLogout: () => void
  onLoginRequest?: () => void
  isGuest?: boolean
  userEmail?: string
  variant?: "light" | "overlay"
}) {
```

В `view === "menu"`:
- Если `isGuest`: не рендерить `MENU_ITEMS` (или только «Обратная связь» + «О приложении»)
- Вместо кнопки «Выйти»:

```tsx
{isGuest ? (
  <button type="button" onClick={() => { close(); onLoginRequest?.() }} ...>
    <LogIn ... />
    Войти / создать аккаунт
  </button>
) : (
  // existing logout button
)}
```

В `view === "about"`: заменить `%` на `<AppLogo size="md" />`.

- [ ] **Step 2: Pass props from `EmptyScreen` and `ResultsScreen`**

`ResultsScreen` добавить `isGuest`, `onLoginRequest`; передать в `UserMenu`.

- [ ] **Step 3: Commit**

```bash
git add components/screens/user-menu.tsx components/screens/results-screen.tsx components/cashback-app.tsx
git commit -m "feat: guest-aware settings menu with login entry"
```

---

### Task 5: Guest save banner on results (~30 min)

**Files:**
- Create: `components/screens/guest-save-banner.tsx`
- Modify: `components/screens/results-screen.tsx`
- Modify: `components/cashback-app.tsx`

- [ ] **Step 1: Create banner**

```tsx
"use client"

import { X } from "lucide-react"
import { motion } from "framer-motion"

export function GuestSaveBanner({
  onLoginRequest,
  onDismiss,
}: {
  onLoginRequest: () => void
  onDismiss: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-slate-900">Сохранить кешбэки?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Войдите, чтобы не потерять их при закрытии приложения
          </p>
          <button
            type="button"
            onClick={onLoginRequest}
            className="mt-3 rounded-xl bg-yellow-200 px-4 py-2 text-[14px] font-semibold text-slate-900 hover:bg-yellow-300"
          >
            Войти / создать аккаунт
          </button>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Закрыть" className="...">
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Render in `ResultsScreen`**

Новые props:

```tsx
showGuestSaveBanner?: boolean
onGuestSaveBannerDismiss?: () => void
onLoginRequest?: () => void
```

После header, перед `ProcessingWarningsBanner`:

```tsx
{showGuestSaveBanner && onLoginRequest && onGuestSaveBannerDismiss && (
  <GuestSaveBanner onLoginRequest={onLoginRequest} onDismiss={onGuestSaveBannerDismiss} />
)}
```

В `cashback-app.tsx`:

```tsx
<ResultsScreen
  showGuestSaveBanner={isGuest && !guestBannerDismissed}
  onGuestSaveBannerDismiss={() => setGuestBannerDismissed(true)}
  onLoginRequest={openAuth}
  isGuest={isGuest}
  ...
/>
```

- [ ] **Step 3: Commit**

```bash
git add components/screens/guest-save-banner.tsx components/screens/results-screen.tsx components/cashback-app.tsx
git commit -m "feat: guest save banner on results screen"
```

---

### Task 6: Orthography pass «кешбэк» (~25 min)

**Files:**
- Modify: все файлы из таблицы spec (раздел «Орфография»)
- Modify: `components/screens/results-screen.tsx` — toast `Матрица сохранена` → `Результат сохранён`

- [ ] **Step 1: Apply replacements**

| Файл | Замены |
|------|--------|
| `bank-select-screen.tsx` | `кэшбека` → `кешбэка`, `кэшбек` → `кешбэк` |
| `duplicate-source-confirm-dialog.tsx` | `Кэшбек` → `Кешбэк` |
| `lib/api.ts` | `кэшбэка` → `кешбэка` |
| `lib/saved-matrices.ts` | `Кэшбэк` → `Кешбэк` |
| `results-overlays.tsx` | `Кэшбэки` → `Кешбэки` |
| `results-screen.tsx` | `кэшбэки` → `кешбэки`, `кэшбэка` → `кешбэка` |
| `user-menu.tsx` | `Кэшбек-профиль` → `Кешбэк-профиль`, `кэшбэк-` → `кешбэк-`, `Кэшбэки` → `Кешбэки` |
| `app/layout.tsx` | title `Кешбэк-агрегатор`, description `кешбэка` |

- [ ] **Step 2: Verify**

```bash
rg 'кэшб|кешбек' components app lib --glob '*.{tsx,ts}'
```

Expected: no matches in user-facing strings.

- [ ] **Step 3: Commit**

```bash
git add components app lib
git commit -m "fix: unify кешбэк spelling in user-facing copy"
```

---

### Task 7: Build + manual QA (~20 min)

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

- [ ] **Step 3: Manual test plan (spec § Test plan)**

1. Гость → empty без auth gate  
2. Full OCR flow без входа  
3. Ссылка «Войти, чтобы сохранить результат» → overlay → вход → overlay закрывается  
4. Меню гостя → «Войти / создать аккаунт»  
5. Results → баннер «Сохранить кешбэки?» → вход → баннер скрыт  
6. Dismiss баннера крестиком → не показывается до reload  
7. Logout → empty, state сброшен  
8. `rg` орфографии — чисто  

- [ ] **Step 4: Commit spec update if needed**

```bash
git add docs/superpowers/specs/2026-06-28-guest-first-screen-design.md
git commit -m "docs: mark guest-first screen plan complete"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Guest-first, no auth gate | Task 2 |
| Empty screen copy + illustration | Task 3 |
| Logo from illustration / fallback SVG | Task 1 |
| Login link on empty | Task 3 |
| Guest menu login | Task 4 |
| Results guest banner B+C | Task 5 |
| Auth overlay, return to same screen | Task 2 |
| No «матрица» in new UI | Tasks 2, 5, 6 |
| «кешбэк» orthography | Task 6 |
| Manual test plan | Task 7 |

## Out of Scope (do not implement here)

- Persisting results to PocketBase after login
- localStorage for banner dismiss
- Backend OCR prompt spelling changes
