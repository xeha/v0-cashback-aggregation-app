# Graph Report - .  (2026-06-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 321 nodes · 532 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7bfe602c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `MapperService` - 14 edges
3. `Kind` - 14 edges
4. `SourceSubmission` - 10 edges
5. `processSubmission()` - 9 edges
6. `createProviderFromSubmission()` - 7 edges
7. `ProviderSuggestion` - 7 edges
8. `getProviderComparisonKey()` - 7 edges
9. `findCatalogMatchInCatalog()` - 7 edges
10. `CashbackMatrix` - 7 edges

## Surprising Connections (you probably didn't know these)
- `ResolveContext` --references--> `SourceSubmission`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/types.ts
- `DuplicateConfirmState` --references--> `SourceSubmission`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/types.ts
- `SubmissionRow` --references--> `Kind`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/types.ts
- `getDuplicateProviderNames()` --calls--> `getProviderComparisonKey()`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/provider-logos.ts
- `OcrFailureState` --references--> `SourceSubmission`  [EXTRACTED]
  components/screens/processing-screen.tsx → lib/types.ts

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Communities (20 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (41): OcrFailureDialog(), ApiError, collectLowConfidenceItems(), extractOcr(), isOcrRecognitionFailure(), isRequestTimeoutError(), isUnreliableMapping(), mapCategories() (+33 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (31): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), Screen, DuplicateSourceConfirmDialog(), formatProviderList(), ProviderKindPickerDialog(), ProviderKindPickerDialogProps (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (29): health(), lifespan(), CategoryMapRequest, CategoryMapRequestItem, CategoryMapResponse, HealthResponse, MappedItem, OcrExtractRequest (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (30): formatLowConfidence(), ProcessingWarningsBanner(), Bank, BankKey, BANKS, CASHBACK_ROWS, CashbackRow, getCurrentMonthYear() (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (29): dependencies, @base-ui/react, class-variance-authority, clsx, framer-motion, lucide-react, next, react (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (22): bankCatalog, CatalogMatchResult, CatalogRecord, findCatalogMatch(), findCatalogMatches(), findCatalogMatchInCatalog(), getCatalog(), getProviderComparisonKey() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (11): aliases, bankCatalog, banks, findCatalogMatch(), getProviderComparisonKey(), isSameProviderIdentity(), marketCatalog, markets (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (7): banks, __dirname, entries, outPath, overrides, overridesPath, root

### Community 10 - "Community 10"
Cohesion: 0.48
Nodes (6): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo()

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): EmptyScreen(), CASHBACK_CATEGORIES, MENU_ITEMS, UserMenu(), View

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (5): banksDir, dataDir, __dirname, marketsDir, root

### Community 13 - "Community 13"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 14 - "Community 14"
Cohesion: 0.70
Nodes (3): cn(), Button(), buttonVariants

## Knowledge Gaps
- **115 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `$schema`, `style` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Kind` connect `Community 1` to `Community 0`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `SourceSubmission` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `CashbackMatrix` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `MapperService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`MapperService` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _115 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0746606334841629 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09080841638981174 - nodes in this community are weakly interconnected._