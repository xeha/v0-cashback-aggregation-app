---
name: cashback-patterns
description: Patterns for the cashback aggregation app — screen state machine, device file picker, matrix results. Apply when editing components, screens, or cashback data.
---

# Cashback App Patterns

Use when working on UI screens, transitions, or cashback matrix logic.

- Keep screen logic in `components/cashback-app.tsx`; screens in `components/screens/`.
- Screenshot pick: `ImageFilePicker` + `readImageFile()` — system gallery on all platforms; open picker in same `onClick` as CTA.
- Thread `kind` (`"bank" | "market"`) through the flow from `empty-screen`.
- Color tiers via `getRowTiers()` from `lib/cashback-data.ts`.
- Match existing Tailwind palette: yellow-200 CTAs, slate text, tier badges.
