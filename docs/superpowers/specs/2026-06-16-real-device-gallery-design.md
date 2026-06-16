# Real Device Gallery — Design Spec

**Date:** 2026-06-16  
**Status:** Approved  
**Scope:** Replace mock screenshot grid with system file picker on all platforms (Mac, iPhone, Android)

## Goal

Let users pick a real screenshot from the device gallery (or Finder on Mac) instead of choosing from hardcoded demo images in `public/screenshots/`. The existing OCR pipeline (`screenshotSrc` → `imageSrcToBase64` → FastAPI) must work unchanged.

## Decisions

| Decision | Choice |
|----------|--------|
| Picker mechanism | Hidden `<input type="file" accept="image/*">` |
| Mock gallery | Remove `GALLERY_PHOTOS` from UI (keep assets in `public/screenshots/` for docs) |
| Platform split | None — real picker everywhere |
| User gesture | Open picker in the same `onClick` as the CTA (never `autoOpen` on mount) |
| Preview step | Gallery screen shows preview + «Добавить» after file is chosen |
| Main flow | Empty CTA → picker → gallery preview → bank-select |
| Add row in bank-select | Picker opens on «Ещё кэшбек» click, no gallery overlay |
| Upload more / replace | Picker opens on button click → bank-select directly |
| HEIC (iPhone) | Phase 2 — convert or show error (Task 4 in plan) |
| Compression | Phase 2 — optional resize > 3 MB (Task 5 in plan) |
| PWA | Not required for file picker |

## File Structure

```
lib/image-utils.ts              # readImageFile(), ImageReadError, size/type validation
components/image-file-picker.tsx # reusable hidden input + openPicker() render prop
components/screens/gallery-screen.tsx  # preview + confirm (no mock grid)
components/screens/empty-screen.tsx    # CTA opens picker in same gesture
components/screens/bank-select-screen.tsx # inline picker for «Ещё кэшбек»
components/cashback-app.tsx       # wire pick → gallery / bank-select; remove dead gallery routes
```

## Data Flow

```
User taps CTA
  → input.click() (same gesture)
  → FileReader → data:image/...;base64,...
  → screenshotSrc string in React state
  → bank-select / processing (existing)
  → imageSrcToBase64() in lib/api.ts (already supports data: URLs)
```

## UX Copy (Russian)

| Element | Text |
|---------|------|
| Gallery title | Выберите скриншот |
| Pick button | Выбрать из галереи |
| Change button | Выбрать другое |
| Confirm | Добавить |
| Cancel | Отмена |
| Invalid type | Выберите изображение в формате JPEG, PNG или WebP. |
| Too large | Файл слишком большой. Максимум — 15 МБ. |

## Out of Scope (Phase 2)

- HEIC conversion (`heic2any`)
- Client-side resize/compression
- Multi-select (one screenshot per flow step)
- Camera capture (`capture` attribute)

## Testing Matrix

| Platform | Entry | Expected |
|----------|-------|----------|
| Mac Safari/Chrome | Empty CTA | Finder file dialog |
| iPhone Safari | Empty CTA | Photos picker |
| Android Chrome | Empty CTA | Gallery picker |
| All | bank-select «Ещё кэшбек» | Picker → new row |
| All | Results «Загрузить ещё» | Picker → bank-select |
| Wi-Fi | Full OCR flow | Works with `192.168.x.x` backend URL |
