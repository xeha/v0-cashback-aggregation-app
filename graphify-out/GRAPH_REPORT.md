# Graph Report - v0-cashback-aggregation-app  (2026-06-17)

## Corpus Check
- 70 files · ~32,877 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 423 nodes · 765 edges · 26 communities (24 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `812f02fb`
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
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]

## God Nodes (most connected - your core abstractions)
1. `MapperService` - 25 edges
2. `compilerOptions` - 16 edges
3. `Kind` - 14 edges
4. `processSubmission()` - 11 edges
5. `CategoryClassifierService` - 10 edges
6. `_normalize_category_name()` - 10 edges
7. `SourceSubmission` - 10 edges
8. `readImageFile()` - 8 edges
9. `CategoryMapRequestItem` - 7 edges
10. `MappedItem` - 7 edges

## Surprising Connections (you probably didn't know these)
- `extract_cashback_items()` --calls--> `Mistral`  [INFERRED]
  backend/services/ocr_service.py → backend/services/category_classifier_service.py
- `ResolveContext` --references--> `SourceSubmission`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/types.ts
- `DuplicateConfirmState` --references--> `SourceSubmission`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/types.ts
- `SubmissionRow` --references--> `Kind`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/types.ts
- `getDuplicateProviderNames()` --calls--> `getProviderComparisonKey()`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/provider-logos.ts

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Communities (26 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (34): OcrFailureDialog(), ApiError, collectBankOfferItems(), collectLowConfidenceItems(), extractOcr(), getBackendUrl(), isOcrRecognitionFailure(), isRequestTimeoutError() (+26 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (37): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), PickMode, Screen, DuplicateSourceConfirmDialog(), formatProviderList(), ImageFilePicker() (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (25): CategoryMapRequestItem, MappedItem, ndarray, SentenceTransformer, ndarray, CategoryMapRequestItem, MappedItem, MatchSource (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (32): formatLowConfidence(), ProcessingWarningsBanner(), Bank, BankKey, BANKS, CASHBACK_ROWS, CashbackRow, getCurrentMonthYear() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (30): dependencies, @base-ui/react, class-variance-authority, clsx, framer-motion, heic2any, lucide-react, next (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (17): ImageFilePickerState, ACCEPTED_IMAGE_TYPES, compressDataUrl(), convertHeicToJpeg(), fileExtension(), guessMimeType(), HEIC_EXTENSIONS, HEIC_TYPES (+9 more)

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
Cohesion: 0.09
Nodes (36): formatCategoryLabel(), labelsEquivalent(), normalizeCategoryLabel(), buildProviderKey(), createProviderFromSubmission(), findMatchingProvider(), groupHasSubcategories(), isMacroOnlyGroup() (+28 more)

### Community 11 - "Community 11"
Cohesion: 0.83
Nodes (3): build_hierarchy(), main(), normalize()

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
Cohesion: 0.11
Nodes (30): health(), lifespan(), _local_network_origin_regex(), Allow phone testing over Wi-Fi (Next.js dev on port 3000)., CategoryMapRequest, CategoryMapResponse, HealthResponse, OcrExtractRequest (+22 more)

### Community 21 - "Community 21"
Cohesion: 0.44
Nodes (8): build_catalog(), load_bank_aliases(), load_hierarchy(), main(), normalize(), ndarray, SentenceTransformer, resolve_two_stage()

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (5): cases, __dirname, isBankService(), normalize(), patterns

### Community 24 - "Community 24"
Cohesion: 0.48
Nodes (6): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo()

### Community 25 - "Community 25"
Cohesion: 0.70
Nodes (4): build_enriched(), fallback_leaf_for_parent(), main(), normalize()

## Knowledge Gaps
- **124 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `$schema`, `style` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Kind` connect `Community 1` to `Community 0`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `MapperService` connect `Community 2` to `Community 20`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `FastAPI` connect `Community 20` to `Community 2`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `MapperService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`MapperService` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _125 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08748615725359911 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07450980392156863 - nodes in this community are weakly interconnected._