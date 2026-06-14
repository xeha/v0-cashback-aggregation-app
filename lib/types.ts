export type Kind = "bank" | "market"

export interface SourceSubmission {
  providerName: string
  screenshotSrc: string
  kind: Kind
}

export interface OcrItem {
  raw_category: string
  rate: number
}

export interface MappedItem {
  raw_category: string
  unified_category: string
  rate: number
  confidence: number
}

export interface MatrixProvider {
  key: string
  name: string
  logo: string
}

export interface MatrixRow {
  category: string
  rates: Record<string, number>
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
