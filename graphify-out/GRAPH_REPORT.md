# Graph Report - v0-cashback-aggregation-app  (2026-06-17)

## Corpus Check
- 60 files · ~24,550 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 374 nodes · 633 edges · 23 communities (21 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c4dca451`
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
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `MapperService` - 15 edges
3. `Kind` - 14 edges
4. `processSubmission()` - 11 edges
5. `SourceSubmission` - 10 edges
6. `readImageFile()` - 8 edges
7. `createProviderFromSubmission()` - 7 edges
8. `ProviderSuggestion` - 7 edges
9. `getProviderComparisonKey()` - 7 edges
10. `findCatalogMatchInCatalog()` - 7 edges

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

## Communities (23 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (42): OcrFailureDialog(), formatLowConfidence(), ProcessingWarningsBanner(), ApiError, collectBankOfferItems(), collectLowConfidenceItems(), extractOcr(), getBackendUrl() (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (34): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), PickMode, Screen, DuplicateSourceConfirmDialog(), formatProviderList(), ImageFilePicker() (+26 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (34): health(), lifespan(), _local_network_origin_regex(), Allow phone testing over Wi-Fi (Next.js dev on port 3000)., CategoryMapRequest, CategoryMapRequestItem, CategoryMapResponse, HealthResponse (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (37): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo(), Bank, BankKey (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (30): dependencies, @base-ui/react, class-variance-authority, clsx, framer-motion, heic2any, lucide-react, next (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (16): ACCEPTED_IMAGE_TYPES, compressDataUrl(), convertHeicToJpeg(), fileExtension(), guessMimeType(), HEIC_EXTENSIONS, HEIC_TYPES, ImageReadError (+8 more)

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
Cohesion: 0.13
Nodes (24): bankCatalog, CatalogMatchResult, CatalogRecord, findCatalogMatch(), findCatalogMatches(), findCatalogMatchInCatalog(), getCatalog(), getProviderComparisonKey() (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (5): banksDir, dataDir, __dirname, marketsDir, root

### Community 13 - "Community 13"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 14 - "Community 14"
Cohesion: 0.70
Nodes (3): cn(), Button(), buttonVariants

### Community 20 - "Community 20"
Cohesion: 0.42
Nodes (8): OcrItem, extract_cashback_items(), filter_bank_services(), _is_bank_service_category(), _load_bank_service_patterns(), _normalize_category_name(), _parse_and_filter_ocr_json(), _parse_ocr_json()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (5): build_catalog(), load_bank_aliases(), main(), normalize(), resolve_unified()

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (5): cases, __dirname, isBankService(), normalize(), patterns

## Knowledge Gaps
- **123 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `$schema`, `style` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Kind` connect `Community 1` to `Community 0`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `CashbackMatrix` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `MapperService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`MapperService` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08421985815602837 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09292929292929293 - nodes in this community are weakly interconnected._