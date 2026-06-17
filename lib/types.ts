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
  unified_category: string
  unified_subcategory?: string
  unified_parent?: string
  rate: number
  confidence: number
  is_macro_category?: boolean
  /** Bank ecosystem offer (e.g. Sber + Samokat) — excluded from comparison matrix */
  is_bank_offer?: boolean
}

export interface MatrixProvider {
  key: string
  name: string
  logo: string
}

export interface MatrixRow {
  category: string
  parent?: string
  bankRaw?: string
  isMacro?: boolean
  rates: Record<string, number>
}

export interface MatrixGroup {
  parent: string
  summaryRates: Record<string, number>
  rows: MatrixRow[]
  isMacroOnly?: boolean
}

export interface CashbackMatrix {
  kind: Kind
  providers: MatrixProvider[]
  rows: MatrixRow[]
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
