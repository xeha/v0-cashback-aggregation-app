# Graph Report - v0-cashback-aggregation-app  (2026-06-24)

## Corpus Check
- 120 files · ~176,075 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 675 nodes · 1331 edges · 46 communities (40 shown, 6 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 121 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `159d66d1`
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
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]

## God Nodes (most connected - your core abstractions)
1. `RetailerResolverService` - 42 edges
2. `MapperService` - 34 edges
3. `MarketSplitMapService` - 29 edges
4. `CategoryMapRequestItem` - 25 edges
5. `ReferenceHierarchy` - 21 edges
6. `compilerOptions` - 16 edges
7. `MappedItem` - 15 edges
8. `labelsEquivalent()` - 14 edges
9. `Kind` - 14 edges
10. `build_hierarchy()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `VerifyCase` --uses--> `CategoryMapRequestItem`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/schemas.py
- `main()` --calls--> `ReferenceHierarchy`  [EXTRACTED]
  scripts/verify_reference_mapper_offline.py → backend/services/reference_hierarchy.py
- `main()` --calls--> `ReferenceHierarchy`  [EXTRACTED]
  scripts/verify_split_map_offline.py → backend/services/reference_hierarchy.py
- `main()` --calls--> `RetailerResolverService`  [EXTRACTED]
  scripts/verify_retailer_resolver.py → backend/services/retailer_resolver_service.py
- `test_departments_parsed_in_order()` --calls--> `build_hierarchy()`  [EXTRACTED]
  backend/tests/test_build_reference_hierarchy.py → scripts/build_reference_hierarchy.py

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Communities (46 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (26): OcrFailureDialog(), ApiError, collectBankOfferItems(), collectLowConfidenceItems(), extractOcr(), getBackendUrl(), isOcrRecognitionFailure(), isRequestTimeoutError() (+18 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (26): createProviderFromSubmission(), findMatchingProvider(), bankCatalog, CatalogMatchResult, CatalogRecord, findCatalogMatch(), findCatalogMatches(), findCatalogMatchInCatalog() (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (43): MapperService, RetailerResolverService, CategoryMapRequest, CategoryMapRequestItem, CategoryMapResponse, HealthResponse, MappedItem, OcrExtractRequest (+35 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (23): Bank, BankKey, BANKS, CASHBACK_ROWS, CashbackRow, getRowTiers(), Market, MARKET_CASHBACK_ROWS (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (35): dependencies, @base-ui/react, class-variance-authority, clsx, framer-motion, heic2any, lucide-react, next (+27 more)

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
Cohesion: 0.40
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
Cohesion: 0.17
Nodes (18): DuplicateSourceConfirmDialog(), formatProviderList(), ProviderKindPickerDialog(), ProviderKindPickerDialogProps, ProviderKindPickerMode, BankSelectInitialRow, buildBankSelectRowState(), submissionToBankSelectRow() (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (9): Chrome, _build_parsed(), _catalog_key(), _create_driver(), _load_json(), main(), Path, _save_json() (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (5): cases, __dirname, isBankService(), normalize(), patterns

### Community 24 - "Community 24"
Cohesion: 0.07
Nodes (55): formatLowConfidence(), ProcessingWarningsBanner(), getCurrentMonthYear(), formatCategoryLabel(), labelsEquivalent(), normalizeCategoryLabel(), buildMarketGroups(), ComparisonAnchorRow (+47 more)

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

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (8): AsyncClient, Any, _assets_url(), _fetch_one(), get(), load_all(), Download all catalogs from R2 into memory. Call once during FastAPI lifespan., Return catalog by name (filename without .json). Raises KeyError if not loaded.

### Community 37 - "Community 37"
Cohesion: 0.07
Nodes (38): health(), lifespan(), _local_network_origin_regex(), Allow phone testing over Wi-Fi (Next.js dev on port 3000)., ndarray, SentenceTransformer, CategoryMapRequestItem, MappedItem (+30 more)

### Community 38 - "Community 38"
Cohesion: 0.10
Nodes (12): Client, RetailerResolverService, Mistral, MonkeyPatch, Response, main(), RetailerEntry, RetailerResolverService (+4 more)

### Community 39 - "Community 39"
Cohesion: 0.48
Nodes (6): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo()

### Community 40 - "Community 40"
Cohesion: 0.32
Nodes (12): _admin_credentials(), _admin_token(), canonical_name(), _fetch_existing_records(), import_retailers(), main(), normalize_retailer_name(), _pocketbase_url() (+4 more)

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (4): CATALOG_DIRS, client, root, SKIP_PATTERNS

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (13): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), PickMode, Screen, ImageFilePicker(), ImageFilePickerState, EmptyScreen() (+5 more)

### Community 44 - "Community 44"
Cohesion: 0.47
Nodes (5): formatConflictDescription(), formatName(), ScreenshotReuseConfirmDialog(), ScreenshotReuseConflict, ScreenshotReuseBlockState

## Knowledge Gaps
- **144 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `Path`, `Response` (+139 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RetailerResolverService` connect `Community 38` to `Community 2`, `Community 37`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `MarketSplitMapService` connect `Community 2` to `Community 28`, `Community 37`, `Community 38`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `MapperService` connect `Community 37` to `Community 2`, `Community 38`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `RetailerResolverService` (e.g. with `MapperService` and `RetailerResolverService`) actually correct?**
  _`RetailerResolverService` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `MapperService` (e.g. with `MapperService` and `RetailerResolverService`) actually correct?**
  _`MapperService` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `MarketSplitMapService` (e.g. with `MapperService` and `RetailerResolverService`) actually correct?**
  _`MarketSplitMapService` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `CategoryMapRequestItem` (e.g. with `MapperService` and `RetailerResolverService`) actually correct?**
  _`CategoryMapRequestItem` has 23 INFERRED edges - model-reasoned connections that need verification._