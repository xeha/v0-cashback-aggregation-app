# Graph Report - v0-cashback-aggregation-app  (2026-06-30)

## Corpus Check
- 202 files · ~204,593 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1311 nodes · 3136 edges · 75 communities (67 shown, 8 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 562 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `11cfd2e7`
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
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]

## God Nodes (most connected - your core abstractions)
1. `RetailerResolverService` - 59 edges
2. `MapperService` - 49 edges
3. `CategoryMapRequestItem` - 44 edges
4. `MappedItem` - 44 edges
5. `MarketSplitMapService` - 44 edges
6. `ProcessSubmissionRequest` - 29 edges
7. `CashbackMatrix` - 26 edges
8. `HTTPException` - 26 edges
9. `BatchPipelineRequest` - 25 edges
10. `CategoryMapRequest` - 24 edges

## Surprising Connections (you probably didn't know these)
- `VerifyCase` --uses--> `CategoryMapRequestItem`  [INFERRED]
  scripts/verify_reference_mapper.py → backend/schemas.py
- `ForgotPasswordPage()` --calls--> `useAuth()`  [EXTRACTED]
  app/forgot-password/page.tsx → lib/auth-context.tsx
- `ResetPasswordContent()` --calls--> `useAuth()`  [EXTRACTED]
  app/reset-password/page.tsx → lib/auth-context.tsx
- `VerifyEmailContent()` --calls--> `useAuth()`  [EXTRACTED]
  app/verify-email/page.tsx → lib/auth-context.tsx
- `VerifyErrorContent()` --calls--> `useAuth()`  [EXTRACTED]
  app/verify-error/page.tsx → lib/auth-context.tsx

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Communities (75 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (19): enrichMatrixState(), mapPipelineError(), mapProcessResponse(), mapSummaryFromApi(), processBatch(), processSubmission(), ApiBatchPipelineErrorDetail, ApiBatchPipelineResponse (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (30): ProviderNameInput(), resolveProviderLogoFields(), bankCatalog, buildCatalog(), CatalogMatchResult, CatalogRecord, findCatalogMatch(), findCatalogMatches() (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (98): health(), lifespan(), _local_network_origin_regex(), Allow phone testing over Wi-Fi (Next.js dev on port 3000)., BackgroundTasks, MapperService, MarketSplitMapService, Request (+90 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (29): Bank, BankKey, BANKS, CASHBACK_ROWS, CashbackRow, getCurrentMonthYear(), getRowTiers(), Market (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (16): dependencies, @base-ui/react, class-variance-authority, clsx, framer-motion, heic2any, html-to-image, lucide-react (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (9): configure_cors_on_dokploy(), DokployClient, load_env_file(), main(), PocketBaseClient, Any, Path, _ssl_context() (+1 more)

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
Cohesion: 0.14
Nodes (27): BaseException, OcrExtractRequest, OcrExtractResponse, OcrItem, BaseException, Mistral, OcrExtractRequest, OcrExtractResponse (+19 more)

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (5): banksDir, dataDir, __dirname, marketsDir, root

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (18): TimewebServerStatusHelpersTest, cmd_backup_create(), cmd_backups(), cmd_status(), fetch_server(), format_mib(), load_timeweb_env(), main() (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.70
Nodes (3): cn(), Button(), buttonVariants

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (27): OcrFailureDialog(), formatLowConfidence(), ProcessingWarningsBanner(), BatchProcessError, isBatchErrorDetail(), isOcrRecognitionFailure(), isRequestTimeoutError(), postJson() (+19 more)

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (9): Chrome, _build_parsed(), _catalog_key(), _create_driver(), _load_json(), main(), Path, _save_json() (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (5): cases, __dirname, isBankService(), normalize(), patterns

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (11): labelsEquivalent(), normalizeCategoryLabel(), consolidateGroupRows(), groupMatrixRows(), isMacroOnlyGroup(), isRedundantBankMacroRowUnderParent(), isRedundantMarketRowUnderParent(), visibleMacroChildren() (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.70
Nodes (4): build_enriched(), fallback_leaf_for_parent(), main(), normalize()

### Community 27 - "Community 27"
Cohesion: 0.35
Nodes (9): _format_actual(), _format_expectations(), _load_backend_env(), main(), VerifyCase, normalize_key(), sanitize_category(), sanitize_raw() (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.06
Nodes (32): Any, CategoryMapRequestItem, MappedItem, MatchSource, Path, ReferenceHierarchy, main(), main() (+24 more)

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
Cohesion: 0.27
Nodes (11): AsyncClient, Any, _assets_url(), _fetch_one(), get(), load_all(), load_from_local(), Return catalog by name (filename without .json). Raises KeyError if not loaded. (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.11
Nodes (25): ndarray, SentenceTransformer, CategoryMapRequestItem, MappedItem, MapperService, main(), _normalize(), main() (+17 more)

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (7): RetailerResolverService, MonkeyPatch, resolver(), test_lookup_hit(), test_lookup_miss(), test_save_entry_upserts_and_updates_cache(), test_upsert_requires_pocketbase_url()

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (32): Request, AuthValidationErrorDetail, AuthValidationErrorResponse, ValidateEmailRequest, ValidateEmailResponse, _client_ip(), validate_email(), domain_accepts_mail() (+24 more)

### Community 40 - "Community 40"
Cohesion: 0.32
Nodes (12): _admin_credentials(), _admin_token(), canonical_name(), _fetch_existing_records(), import_retailers(), main(), normalize_retailer_name(), _pocketbase_url() (+4 more)

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (4): CATALOG_DIRS, client, root, SKIP_PATTERNS

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (15): _admin_credentials(), _admin_token(), _auth_headers(), _ensure_collection(), _import_retailer_catalog(), _list_collections(), _load_catalog(), _load_env_file() (+7 more)

### Community 44 - "Community 44"
Cohesion: 0.18
Nodes (15): buildMarketGroups(), ComparisonAnchorRow, ComparisonGroup, ComparisonItemRow, ComparisonPart, ComparisonRow, findAnchorDepth(), partsInAnchorSubtree() (+7 more)

### Community 45 - "Community 45"
Cohesion: 0.35
Nodes (7): _auth_ok(), Client, _compose_yaml(), main(), Any, Request, _require()

### Community 46 - "Community 46"
Cohesion: 0.80
Nodes (4): analyze_chunk(), fetch(), find_logo_chunks(), main()

### Community 47 - "Community 47"
Cohesion: 0.36
Nodes (6): _cert_issuer(), Client, main(), Any, Request, _require()

### Community 48 - "Community 48"
Cohesion: 0.06
Nodes (85): ComparisonPart, MatrixGroup, MatrixProvider, MatrixRow, ReferencePathNode, CashbackMatrix, Client, Path (+77 more)

### Community 49 - "Community 49"
Cohesion: 0.40
Nodes (5): Client, main(), Any, Request, _require()

### Community 50 - "Community 50"
Cohesion: 0.32
Nodes (11): _load_env(), _load_env_file(), main(), _pb_superuser_token(), Client, Path, _require(), verify_assets_url() (+3 more)

### Community 51 - "Community 51"
Cohesion: 0.06
Nodes (73): main(), parse_services(), build_env_block(), deploy_fastapi(), ensure_git_branch_pushed(), load_backend_env(), main(), Any (+65 more)

### Community 52 - "Community 52"
Cohesion: 0.27
Nodes (6): AuthContext, AuthContextValue, getClientPocketBase(), RegisterResult, createPocketBase(), getPocketBaseUrl()

### Community 53 - "Community 53"
Cohesion: 0.29
Nodes (8): ProviderKindPickerDialog(), ProviderKindPickerDialogProps, ProviderKindPickerMode, ApiCashbackMatrix, ProviderSuggestion, Kind, ResolutionTask, SubmissionRow

### Community 56 - "Community 56"
Cohesion: 0.10
Nodes (26): CashbackApp(), EMPTY_PROCESSING_SUMMARY, getBankSelectInitialRows(), PickMode, Screen, DuplicateSourceConfirmDialog(), formatProviderList(), ImageFilePicker() (+18 more)

### Community 57 - "Community 57"
Cohesion: 0.35
Nodes (15): check_api_health(), check_cors(), check_frontend(), check_pb_auth(), check_pb_health(), check_retailer_lookup(), check_s3_logo(), check_save_matrix() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.10
Nodes (32): AppLogo(), AppLogoProps, ROUND_CLASS, SIZE_CLASS, countCategories(), countMatrixProviders(), getSavedMatrix(), listSavedMatrices() (+24 more)

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (8): ApiError, OcrEmptyError, OcrUnreliableError, validateEmailMx(), ValidateEmailMxResult, getBackendUrl(), mockedValidateEmailMx, UseEmailBlurValidationOptions

### Community 60 - "Community 60"
Cohesion: 0.26
Nodes (8): openAuthFromEmpty(), registerViaUi(), createTestPocketBase(), isPocketBaseReady(), uniqueTestEmail(), formatAuthError(), MESSAGE_OVERRIDES, STATUS_MESSAGES

### Community 61 - "Community 61"
Cohesion: 0.18
Nodes (16): ACCEPTED_IMAGE_TYPES, compressDataUrl(), convertHeicToJpeg(), fileExtension(), guessMimeType(), HEIC_EXTENSIONS, HEIC_TYPES, ImageReadError (+8 more)

### Community 62 - "Community 62"
Cohesion: 0.19
Nodes (8): geistMono, geistSans, metadata, viewport, AppProviders(), PwaRegistrar(), AuthProvider(), registerServiceWorker()

### Community 63 - "Community 63"
Cohesion: 0.48
Nodes (6): getPlaceholderAvatarColors(), getProviderInitial(), hashString(), isPlaceholderProviderLogo(), PLACEHOLDER_PALETTE, ProviderLogo()

### Community 65 - "Community 65"
Cohesion: 0.14
Nodes (17): formatCategoryLabel(), countProvidersInGroup(), buildMatrixShareText(), captureElementPng(), dataUrlToBlob(), deliverPngFile(), downloadBlob(), formatRatesLine() (+9 more)

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (11): AuthEmailField(), AuthEmailFieldProps, AuthPageShell(), AuthPageShellProps, ForgotPasswordPage(), useAuth(), useEmailBlurValidation(), ResetPasswordContent() (+3 more)

### Community 67 - "Community 67"
Cohesion: 0.29
Nodes (5): AuthScreen(), AuthScreenProps, AuthTab, AuthView, PasswordFieldProps

### Community 69 - "Community 69"
Cohesion: 0.27
Nodes (12): COMMON_PASSWORDS, DISPOSABLE_EMAIL_DOMAINS, ROLE_BASED_EMAIL_LOCALS, normalizeEmail(), PasswordValidationResult, validateEmailFormat(), validateForgotPasswordInput(), validateLoginInput() (+4 more)

### Community 71 - "Community 71"
Cohesion: 0.16
Nodes (10): authRefresh, authWithPassword, clear, confirmPasswordReset, confirmVerification, create, onChange, requestPasswordReset (+2 more)

### Community 74 - "Community 74"
Cohesion: 0.12
Nodes (16): devDependencies, @aws-sdk/client-s3, jsdom, @playwright/test, postcss, sharp, tailwindcss, @tailwindcss/postcss (+8 more)

### Community 77 - "Community 77"
Cohesion: 0.14
Nodes (14): scripts, build, dev, generate:pwa-icons, lint, security:audit, start, test (+6 more)

### Community 82 - "Community 82"
Cohesion: 0.40
Nodes (4): innerSize, offset, sizes, svg

### Community 83 - "Community 83"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **208 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `viewport`, `VerifySuccessPageProps` (+203 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MapperService` connect `Community 2` to `Community 37`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `RetailerResolverService` connect `Community 2` to `Community 37`, `Community 38`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `FastAPI` connect `Community 2` to `Community 11`, `Community 39`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `RetailerResolverService` (e.g. with `BackgroundTasks` and `MapperService`) actually correct?**
  _`RetailerResolverService` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Are the 30 inferred relationships involving `MapperService` (e.g. with `BackgroundTasks` and `MapperService`) actually correct?**
  _`MapperService` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Are the 42 inferred relationships involving `CategoryMapRequestItem` (e.g. with `BackgroundTasks` and `MapperService`) actually correct?**
  _`CategoryMapRequestItem` has 42 INFERRED edges - model-reasoned connections that need verification._
- **Are the 42 inferred relationships involving `MappedItem` (e.g. with `Any` and `CashbackMatrix`) actually correct?**
  _`MappedItem` has 42 INFERRED edges - model-reasoned connections that need verification._