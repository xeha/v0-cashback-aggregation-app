export type Kind = "bank" | "market"

export interface SourceSubmission {
  providerName: string
  screenshotSrc: string
  kind: Kind
  /** Set when user picks from catalog or name exactly matches catalog */
  providerSlug?: string
}

export interface OcrItem {
  raw_category: string
  rate: number
}

export interface MappedItem {
  raw_category: string
  normalized_raw_category?: string
  normalize_source?: "sanitize" | "passthrough"
  unified_category: string
  unified_subcategory?: string
  unified_parent?: string
  rate: number
  confidence: number
  is_macro_category?: boolean
  /** Bank ecosystem offer (e.g. Sber + Samokat) — excluded from comparison matrix */
  is_bank_offer?: boolean
  reference_node_id?: string
  reference_department?: string
  reference_category?: string
  reference_subcategory?: string
  reference_depth?: number
  split_text?: string
  reference_path?: { id: string; name: string }[]
  display_label?: string
  match_source?:
    | "catalog"
    | "synonym"
    | "embedding"
    | "llm"
    | "reference_llm"
    | "reference_cache"
    | "reference_fallback"
    | "reference_split_llm"
}

export interface MatrixProvider {
  key: string
  name: string
  logo: string
  slug?: string
}

export interface MatrixRow {
  category: string
  /** Canonical label for row merge when display differs from comparison key */
  canonicalCategory?: string
  parent?: string
  bankRaw?: string
  /** OCR label from screenshot; shown when only one market exists in the parent group */
  marketRaw?: string
  isMacro?: boolean
  referenceNodeId?: string
  referenceDepartment?: string
  referenceCategory?: string
  referenceSubcategory?: string
  referenceDepth?: number
  /** "anchor" — строка сравнения (LCA); "item" — отдельный товар */
  rowKind?: "anchor" | "item"
  referencePath?: { id: string; name: string }[]
  /** Диапазон ставок по магазину для строки-якоря */
  rateRanges?: Record<string, { min: number; max: number }>
  rates: Record<string, number>
}

export interface MatrixGroup {
  /** Отдел (path[0]) — сортировка и ключ раскрытия. */
  parent: string
  /** LCA-заголовок для UI; если не задан — parent. */
  displayParent?: string
  summaryRates: Record<string, number>
  rows: MatrixRow[]
  isMacroOnly?: boolean
}

export interface CashbackMatrix {
  kind: Kind
  providers: MatrixProvider[]
  rows: MatrixRow[]
  /** Сырые части market для LCA-группировки (только kind="market") */
  marketParts?: import("@/lib/market-comparison").ComparisonPart[]
}

export interface MatrixState {
  bank: CashbackMatrix | null
  market: CashbackMatrix | null
}

export interface OcrExtractResponse {
  items: OcrItem[]
}

export interface CategoryMapResponse {
  items: MappedItem[]
}

export interface SkippedSubmission {
  providerName: string
  message: string
}

export interface LowConfidenceItem {
  providerName: string
  rawCategory: string
  unifiedCategory: string
  confidence: number
}

export interface BankOfferItem {
  providerName: string
  rawCategory: string
  unifiedCategory: string
  rate: number
}

export interface ProcessingSummary {
  skipped: SkippedSubmission[]
  lowConfidence: LowConfidenceItem[]
  bankOffers: BankOfferItem[]
}
