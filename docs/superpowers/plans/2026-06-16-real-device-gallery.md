# Real Device Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock screenshot grid with the system file picker on Mac, iPhone, and Android while keeping the existing OCR pipeline intact.

**Architecture:** `readImageFile()` converts `File` → `data:` URL; `ImageFilePicker` opens `<input type="file">` inside the user’s click handler; `GalleryScreen` becomes preview+confirm; bank-select uses inline picker for extra rows; cashback-app routes pick results to bank-select without losing the user gesture.

**Tech Stack:** Next.js 16, React 19, TypeScript, FileReader API, existing `lib/image-utils.ts` / `lib/api.ts`.

**Spec:** `docs/superpowers/specs/2026-06-16-real-device-gallery-design.md`

**Estimated total:** ~6 h (MVP steps 1–3 + 6–7: ~4 h)

---

## File Map

| File | Responsibility |
|------|----------------|
| `lib/image-utils.ts` | `readImageFile`, `ImageReadError`, validation |
| `components/image-file-picker.tsx` | Hidden input + `openPicker()` render prop |
| `components/screens/gallery-screen.tsx` | Preview + confirm (no mock grid) |
| `components/screens/empty-screen.tsx` | CTA triggers picker in same gesture |
| `components/screens/bank-select-screen.tsx` | Inline picker for «Ещё кэшбек» |
| `components/cashback-app.tsx` | Wire `onFilePicked` flows, simplify gallery routes |

---

### Task 1: Image file reading utility (~30 min)

**Files:**
- Modify: `lib/image-utils.ts`

- [x] **Step 1: Add `ImageReadError`, `MAX_IMAGE_FILE_BYTES`, `readImageFile()`**

```typescript
export const MAX_IMAGE_FILE_BYTES = 15 * 1024 * 1024

export class ImageReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageReadError"
  }
}

export function readImageFile(file: File): Promise<string> {
  // validate type + size, FileReader.readAsDataURL
}
```

- [ ] **Step 2: Manual check**

Open browser console on dev server; verify `readImageFile` rejects `.pdf` and accepts `.jpg`.

---

### Task 2: Rewrite `GalleryScreen` (~1 h 30 min)

**Files:**
- Create: `components/image-file-picker.tsx`
- Modify: `components/screens/gallery-screen.tsx`

- [x] **Step 1: Create `ImageFilePicker` render-prop component**

Hidden `input[type=file accept=image/*]`, `openPicker()`, `isReading`, `error` state.

- [x] **Step 2: Replace mock grid with preview UI**

Props: `initialSrc?: string | null`, `onCancel`, `onAdd(src)`.

UI: preview image, «Выбрать из галереи» / «Выбрать другое», «Отмена», «Добавить» (disabled until image selected).

- [ ] **Step 3: Visual check on desktop**

Pick a JPEG from Finder; preview renders; Add calls `onAdd` with `data:` URL.

---

### Task 3: User gesture wiring (~45 min)

**Files:**
- Modify: `components/screens/empty-screen.tsx`
- Modify: `components/screens/bank-select-screen.tsx`
- Modify: `components/cashback-app.tsx`

- [x] **Step 1: Empty screen — picker on CTA click**

`onUpload(kind)` → `onFilePicked(kind, src)` after successful pick in same gesture.

- [x] **Step 2: cashback-app — empty → gallery preview → bank-select**

Set `initialShot` + `galleryPrefillSrc` on pick; gallery confirms → bank-select.

- [x] **Step 3: bank-select — inline picker on «Ещё кэшбек»**

Remove `GalleryScreen` overlay; `startAddBank()` calls `openPicker()` in same click.

- [x] **Step 4: Upload more / replace screenshot**

`results-screen` and `processing-screen` callbacks open picker from parent (cashback-app holds `ImageFilePicker` ref or handler).

- [ ] **Step 5: Manual check on phone (Wi-Fi)**

`http://192.168.x.x:3000` → CTA → iOS/Android gallery opens.

---

### Task 4: HEIC support (~1 h)

**Files:**
- Modify: `lib/image-utils.ts`
- Optional dependency: `heic2any`

- [ ] **Step 1: Detect `image/heic` / `.heic` extension**
- [ ] **Step 2: Convert to JPEG before `data:` URL**
- [ ] **Step 3: Test with iPhone screenshot**

---

### Task 5: Client-side compression (~45 min)

**Files:**
- Modify: `lib/image-utils.ts`

- [ ] **Step 1: If file > 3 MB, draw to canvas, export JPEG quality 0.85, max 2048px**
- [ ] **Step 2: Test with large PNG screenshot**

---

### Task 6: Cross-platform testing (~45 min)

- [ ] Mac Finder pick → full OCR flow
- [ ] iPhone Safari → gallery pick → OCR
- [ ] Android Chrome → gallery pick → OCR
- [ ] bank-select add row
- [ ] Cancel / pick another file
- [ ] Wi-Fi backend (`192.168.x.x`)

---

### Task 7: Cleanup (~20 min)

- [ ] Remove dead gallery navigation paths from `cashback-app.tsx`
- [ ] Update `CLAUDE.md` — real upload implemented
- [ ] Update `.cursor/skills/cashback-patterns/SKILL.md` — remove «mock gallery» note

---

## Time Summary

| Task | Estimate | Status |
|------|----------|--------|
| 1. `readImageFile` utility | 30 min | Done |
| 2. `GalleryScreen` + `ImageFilePicker` | 1 h 30 min | Done |
| 3. User gesture wiring | 45 min | Done |
| 4. HEIC | 1 h | Pending |
| 5. Compression | 45 min | Pending |
| 6. Testing | 45 min | Pending |
| 7. Cleanup | 20 min | Pending |
| **MVP (1–3, 6–7)** | **~4 h** | |
| **Full** | **~6 h** | |
