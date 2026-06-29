# AGENTS.md

Guidance for AI agents working in this repository.

## Commands

```bash
pnpm dev    # http://localhost:3000
pnpm build
pnpm lint
```

No tests in this project.

## Architecture

Mobile-first **Next.js 16** app (TypeScript, Tailwind CSS v4, Framer Motion). Russian-language cashback aggregator.

### Screen state machine

`components/cashback-app.tsx` — `currentScreen`:

```
empty → gallery → bank-select → processing → results
```

`kind` (`"bank" | "market"`) is set at `empty` and threaded through all screens.

### Device upload

- `ImageFilePicker` opens system gallery via `<input type="file">` in the same user gesture as the CTA
- `readImageFile()` in `lib/image-utils.ts` — HEIC → JPEG (`heic2any`), compress files > 3 MB

### Data

`lib/cashback-data.ts` — `BANKS`, `MARKETS`, `CASHBACK_ROWS`, `getRowTiers()`, `getCurrentMonthYear()`.

### Conventions

- Screens: `components/screens/`
- Transitions: `<AnimatePresence mode="wait">`, 0.35s opacity + y-slide
- Phone shell on `sm:` breakpoints
- Tier colors: green/yellow/red for cashback rates

### Git branches and deploy

**Never merge `dev` → `main` or deploy to production without explicit user approval.**

Flow: `dev` → test on `dev.cashbackbrain.ru` → user confirms → `main` → production.

See `.cursor/rules/deploy-git-workflow.mdc` for the full agent checklist (CDN/env changes, Dokploy targets, verification scripts).
