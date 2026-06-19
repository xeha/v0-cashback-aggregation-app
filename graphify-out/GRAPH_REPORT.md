# Graph Report - v0-cashback-aggregation-app  (2026-06-19)

## Corpus Check
- 98 files · ~167,007 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 540 nodes · 1058 edges · 32 communities (29 shown, 3 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 91 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d539be4c`
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
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]

## God Nodes (most connected - your core abstractions)
1. `MapperService` - 27 edges
2. `ReferenceMapperService` - 27 edges
3. `CategoryMapRequestItem` - 23 edges
4. `CategoryCompoundSplitService` - 19 edges
5. `ReferenceHierarchy` - 17 edges
6. `compilerOptions` - 16 edges
7. `MappedItem` - 14 edges
8. `Kind` - 14 edges
9. `mergeMappedItems()` - 13 edges
10. `CategoryClassifierService` - 11 edges

## Surprising Connections (you probably didn't know these)
- `VerifyCase` --uses--> `CategoryMapRequestItem`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/schemas.py
- `VerifyCase` --uses--> `ReferenceMapperService`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/services/reference_mapper_service.py
- `main()` --calls--> `ReferenceMapperService`  [EXTRACTED]
  scripts/verify_reference_mapper.py → backend/services/reference_mapper_service.py
- `main()` --calls--> `CategoryMapRequestItem`  [EXTRACTED]
  scripts/verify_reference_mapper.py → backend/services/reference_mapper_service.py
- `ResolveContext` --references--> `SourceSubmission`  [EXTRACTED]
  components/screens/bank-select-screen.tsx → lib/types.ts

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Communities (32 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): OcrFailureDialog(), formatLowConfidence(), ProcessingWarningsBanner(), ApiError, collectBankOfferItems(), collectLowConfidenceItems(), extractOcr(), getBackendUrl() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (61): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), PickMode, Screen, DuplicateSourceConfirmDialog(), formatProviderList(), ImageFilePicker() (+53 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (27): MappedItem, Mistral, ndarray, SentenceTransformer, CategoryMapRequestItem, MappedItem, ndarray, SentenceTransformer (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (36): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo(), Bank, BankKey (+28 more)

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
Cohesion: 1.00
Nodes (3): load_market_aliases(), _normalize_market_name(), resolve_market_slug()

### Community 11 - "Community 11"
Cohesion: 0.47
Nodes (9): OcrItem, extract_cashback_items(), filter_bank_services(), _finalize_ocr_items(), _is_bank_service_category(), _load_bank_service_patterns(), _normalize_category_name(), _parse_ocr_json() (+1 more)

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
Cohesion: 0.07
Nodes (44): health(), lifespan(), _local_network_origin_regex(), Allow phone testing over Wi-Fi (Next.js dev on port 3000)., CategoryMapRequest, CategoryMapRequestItem, CategoryMapResponse, HealthResponse (+36 more)

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (9): Chrome, _build_parsed(), _catalog_key(), _create_driver(), _load_json(), main(), Path, _save_json() (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (5): cases, __dirname, isBankService(), normalize(), patterns

### Community 24 - "Community 24"
Cohesion: 0.35
Nodes (9): _format_actual(), _format_expectations(), _load_backend_env(), main(), VerifyCase, normalize_key(), sanitize_category(), sanitize_raw() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.70
Nodes (4): build_enriched(), fallback_leaf_for_parent(), main(), normalize()

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (5): Path, main(), ReferenceHierarchy, ReferenceNode, resolve_display_node()

### Community 29 - "Community 29"
Cohesion: 0.31
Nodes (12): Any, Namespace, build_reference_hierarchy(), _collapse_spaces(), main(), _parse_args(), _parse_tree_block(), Path (+4 more)

### Community 30 - "Community 30"
Cohesion: 0.44
Nodes (8): build_catalog(), load_bank_aliases(), load_hierarchy(), main(), normalize(), ndarray, SentenceTransformer, resolve_two_stage()

### Community 31 - "Community 31"
Cohesion: 0.83
Nodes (3): build_hierarchy(), main(), normalize()

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (26): formatCategoryLabel(), labelsEquivalent(), normalizeCategoryLabel(), buildProviderKey(), consolidateGroupRows(), createProviderFromSubmission(), findMatchingProvider(), getReferenceDepth() (+18 more)

## Knowledge Gaps
- **128 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `Mistral`, `Path` (+123 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MapperService` connect `Community 2` to `Community 20`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `ReferenceMapperService` connect `Community 20` to `Community 24`, `Community 2`, `Community 28`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `CategoryMapRequestItem` connect `Community 20` to `Community 24`, `Community 2`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `MapperService` (e.g. with `CategoryCompoundSplitService` and `CategoryMapRequest`) actually correct?**
  _`MapperService` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `ReferenceMapperService` (e.g. with `CategoryCompoundSplitService` and `CategoryMapRequest`) actually correct?**
  _`ReferenceMapperService` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `CategoryMapRequestItem` (e.g. with `CategoryMapRequestItem` and `CategoryMapRequestItem`) actually correct?**
  _`CategoryMapRequestItem` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `CategoryCompoundSplitService` (e.g. with `CategoryCompoundSplitService` and `CategoryMapRequest`) actually correct?**
  _`CategoryCompoundSplitService` has 9 INFERRED edges - model-reasoned connections that need verification._