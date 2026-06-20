# Graph Report - v0-cashback-aggregation-app  (2026-06-19)

## Corpus Check
- 107 files · ~169,031 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 571 nodes · 1087 edges · 36 communities (33 shown, 3 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f53805cf`
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
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]

## God Nodes (most connected - your core abstractions)
1. `MarketSplitMapService` - 27 edges
2. `MapperService` - 26 edges
3. `ReferenceHierarchy` - 21 edges
4. `CategoryMapRequestItem` - 20 edges
5. `compilerOptions` - 16 edges
6. `MappedItem` - 14 edges
7. `Kind` - 14 edges
8. `build_hierarchy()` - 14 edges
9. `CategoryMapRequestItem` - 13 edges
10. `CategoryClassifierService` - 11 edges

## Surprising Connections (you probably didn't know these)
- `VerifyCase` --uses--> `CategoryMapRequestItem`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/schemas.py
- `main()` --calls--> `ReferenceHierarchy`  [EXTRACTED]
  scripts/verify_reference_mapper_offline.py → backend/services/reference_hierarchy.py
- `main()` --calls--> `ReferenceHierarchy`  [EXTRACTED]
  scripts/verify_split_map_offline.py → backend/services/reference_hierarchy.py
- `test_departments_parsed_in_order()` --calls--> `build_hierarchy()`  [EXTRACTED]
  backend/tests/test_build_reference_hierarchy.py → scripts/build_reference_hierarchy.py
- `test_department_ids_are_sequential()` --calls--> `build_hierarchy()`  [EXTRACTED]
  backend/tests/test_build_reference_hierarchy.py → scripts/build_reference_hierarchy.py

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Communities (36 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): OcrFailureDialog(), formatLowConfidence(), ProcessingWarningsBanner(), ApiError, collectBankOfferItems(), collectLowConfidenceItems(), extractOcr(), getBackendUrl() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (54): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), PickMode, Screen, DuplicateSourceConfirmDialog(), formatProviderList(), ImageFilePicker() (+46 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (27): lifespan(), ndarray, SentenceTransformer, CategoryMapRequestItem, MappedItem, MatchSource, ndarray, SentenceTransformer (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (39): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo(), Bank, BankKey (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (32): dependencies, @base-ui/react, class-variance-authority, clsx, framer-motion, heic2any, lucide-react, next (+24 more)

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
Cohesion: 0.08
Nodes (45): Any, health(), _local_network_origin_regex(), Allow phone testing over Wi-Fi (Next.js dev on port 3000)., CategoryMapRequest, CategoryMapRequestItem, CategoryMapResponse, HealthResponse (+37 more)

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (9): Chrome, _build_parsed(), _catalog_key(), _create_driver(), _load_json(), main(), Path, _save_json() (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (5): cases, __dirname, isBankService(), normalize(), patterns

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (35): formatCategoryLabel(), labelsEquivalent(), normalizeCategoryLabel(), buildMarketGroups(), ComparisonAnchorRow, ComparisonGroup, ComparisonItemRow, ComparisonPart (+27 more)

### Community 25 - "Community 25"
Cohesion: 0.70
Nodes (4): build_enriched(), fallback_leaf_for_parent(), main(), normalize()

### Community 27 - "Community 27"
Cohesion: 0.35
Nodes (9): _format_actual(), _format_expectations(), _load_backend_env(), main(), VerifyCase, normalize_key(), sanitize_category(), sanitize_raw() (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (14): Path, ReferenceHierarchy, main(), main(), _normalize(), ReferenceHierarchy, ReferenceNode, _hierarchy() (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (17): build_hierarchy(), _clean_text(), _collect_ids(), _extract_node_label(), _iter_tree_blocks(), _line_depth(), main(), Path (+9 more)

### Community 30 - "Community 30"
Cohesion: 0.44
Nodes (8): build_catalog(), load_bank_aliases(), load_hierarchy(), main(), normalize(), ndarray, SentenceTransformer, resolve_two_stage()

### Community 31 - "Community 31"
Cohesion: 0.83
Nodes (3): build_hierarchy(), main(), normalize()

## Knowledge Gaps
- **133 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `Path`, `$schema` (+128 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MarketSplitMapService` connect `Community 20` to `Community 2`, `Community 28`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `MapperService` connect `Community 2` to `Community 20`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `ReferenceHierarchy` connect `Community 28` to `Community 20`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `MarketSplitMapService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`MarketSplitMapService` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `MapperService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`MapperService` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `ReferenceHierarchy` (e.g. with `Any` and `CategoryMapRequestItem`) actually correct?**
  _`ReferenceHierarchy` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `CategoryMapRequestItem` (e.g. with `Any` and `CategoryMapRequestItem`) actually correct?**
  _`CategoryMapRequestItem` has 18 INFERRED edges - model-reasoned connections that need verification._