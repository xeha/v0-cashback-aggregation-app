# Graph Report - v0-cashback-aggregation-app  (2026-06-18)

## Corpus Check
- 99 files · ~166,437 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 531 nodes · 1023 edges · 33 communities (30 shown, 3 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `460d9c4c`
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
- [[_COMMUNITY_Community 32|Community 32]]

## God Nodes (most connected - your core abstractions)
1. `MapperService` - 27 edges
2. `ReferenceMapperService` - 27 edges
3. `CategoryNormalizerService` - 19 edges
4. `ReferenceHierarchy` - 17 edges
5. `compilerOptions` - 16 edges
6. `CategoryMapRequestItem` - 15 edges
7. `MappedItem` - 14 edges
8. `Kind` - 14 edges
9. `mergeMappedItems()` - 12 edges
10. `CategoryClassifierService` - 11 edges

## Surprising Connections (you probably didn't know these)
- `VerifyCase` --uses--> `CategoryMapRequestItem`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/schemas.py
- `main()` --calls--> `CategoryNormalizerService`  [EXTRACTED]
  scripts/verify_category_normalizer.py → backend/services/category_normalizer_service.py
- `VerifyCase` --uses--> `CategoryNormalizerService`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/services/category_normalizer_service.py
- `VerifyCase` --uses--> `ReferenceMapperService`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/services/reference_mapper_service.py
- `main()` --calls--> `CategoryMapRequestItem`  [EXTRACTED]
  scripts/verify_reference_mapper.py → backend/services/reference_mapper_service.py

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Communities (33 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (59): OcrFailureDialog(), formatLowConfidence(), ProcessingWarningsBanner(), ApiError, collectBankOfferItems(), collectLowConfidenceItems(), extractOcr(), getBackendUrl() (+51 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (37): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), PickMode, Screen, DuplicateSourceConfirmDialog(), formatProviderList(), ImageFilePicker() (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (32): CategoryMapRequestItem, MappedItem, Mistral, ndarray, SentenceTransformer, CategoryMapRequestItem, MappedItem, ndarray (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (23): Bank, BankKey, BANKS, CASHBACK_ROWS, CashbackRow, getRowTiers(), Market, MARKET_CASHBACK_ROWS (+15 more)

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
Cohesion: 1.00
Nodes (3): load_market_aliases(), _normalize_market_name(), resolve_market_slug()

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (17): HealthResponse, OcrExtractRequest, OcrExtractResponse, OcrItem, BaseModel, OcrExtractRequest, OcrExtractResponse, OcrItem (+9 more)

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
Nodes (37): health(), lifespan(), _local_network_origin_regex(), Allow phone testing over Wi-Fi (Next.js dev on port 3000)., CategoryMapRequest, CategoryMapResponse, Path, CategoryMapRequest (+29 more)

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (9): Chrome, _build_parsed(), _catalog_key(), _create_driver(), _load_json(), main(), Path, _save_json() (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (5): cases, __dirname, isBankService(), normalize(), patterns

### Community 24 - "Community 24"
Cohesion: 1.00
Nodes (3): main(), _normalize_key(), _permutations_for_key()

### Community 25 - "Community 25"
Cohesion: 0.70
Nodes (4): build_enriched(), fallback_leaf_for_parent(), main(), normalize()

### Community 27 - "Community 27"
Cohesion: 0.48
Nodes (6): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo()

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
Cohesion: 0.12
Nodes (27): createProviderFromSubmission(), findMatchingProvider(), bankCatalog, CatalogMatchResult, CatalogRecord, findCatalogMatch(), findCatalogMatches(), findCatalogMatchInCatalog() (+19 more)

## Knowledge Gaps
- **128 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `Mistral`, `Path` (+123 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MapperService` connect `Community 2` to `Community 20`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `ReferenceMapperService` connect `Community 20` to `Community 2`, `Community 28`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `Kind` connect `Community 1` to `Community 0`, `Community 32`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `MapperService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`MapperService` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `ReferenceMapperService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`ReferenceMapperService` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `CategoryNormalizerService` (e.g. with `CategoryMapRequest` and `CategoryMapResponse`) actually correct?**
  _`CategoryNormalizerService` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `ReferenceHierarchy` (e.g. with `CategoryMapRequestItem` and `MappedItem`) actually correct?**
  _`ReferenceHierarchy` has 6 INFERRED edges - model-reasoned connections that need verification._