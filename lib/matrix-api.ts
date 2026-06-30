import { getProviderLogoBySlug, resolveProviderLogo } from "@/lib/provider-logos"
import type {
  CashbackMatrix,
  Kind,
  MatrixGroup,
  MatrixProvider,
  MatrixRow,
} from "@/lib/types"
import type { ComparisonPart } from "@/lib/market-comparison"

/** Snake_case matrix payload from POST /api/pipeline/process */
export interface ApiMatrixProvider {
  key: string
  name: string
  slug?: string | null
}

export interface ApiMatrixRow {
  category: string
  canonical_category?: string | null
  parent?: string | null
  bank_raw?: string | null
  market_raw?: string | null
  is_macro?: boolean
  reference_node_id?: string | null
  reference_department?: string | null
  reference_depth?: number | null
  row_kind?: "anchor" | "item" | null
  rate_ranges?: Record<string, { min: number; max: number }> | null
  rates: Record<string, number>
}

export interface ApiComparisonPart {
  store: string
  rate: number
  label: string
  node_id: string
  path: { id: string; name: string }[]
}

export interface ApiMatrixGroup {
  parent: string
  display_parent?: string | null
  summary_rates: Record<string, number>
  rows: ApiMatrixRow[]
  is_macro_only?: boolean | null
}

export interface ApiCashbackMatrix {
  kind: Kind
  providers: ApiMatrixProvider[]
  rows: ApiMatrixRow[]
  market_parts?: ApiComparisonPart[] | null
}

export interface ApiProcessSubmissionResponse {
  matrix: ApiCashbackMatrix
  groups: ApiMatrixGroup[]
  low_confidence: {
    provider_name: string
    raw_category: string
    unified_category: string
    confidence: number
  }[]
  bank_offers: {
    provider_name: string
    raw_category: string
    unified_category: string
    rate: number
  }[]
}

function apiGroupToClient(group: ApiMatrixGroup): MatrixGroup {
  return {
    parent: group.parent,
    displayParent: group.display_parent ?? undefined,
    summaryRates: group.summary_rates,
    rows: group.rows.map(apiRowToClient),
    isMacroOnly: group.is_macro_only ?? undefined,
  }
}

function apiRowToClient(row: ApiMatrixRow): MatrixRow {
  return {
    category: row.category,
    canonicalCategory: row.canonical_category ?? undefined,
    parent: row.parent ?? undefined,
    bankRaw: row.bank_raw ?? undefined,
    marketRaw: row.market_raw ?? undefined,
    isMacro: row.is_macro ?? undefined,
    referenceNodeId: row.reference_node_id ?? undefined,
    referenceDepartment: row.reference_department ?? undefined,
    referenceDepth: row.reference_depth ?? undefined,
    rowKind: row.row_kind ?? undefined,
    rateRanges: row.rate_ranges ?? undefined,
    rates: row.rates,
  }
}

function clientRowToApi(row: MatrixRow): ApiMatrixRow {
  return {
    category: row.category,
    canonical_category: row.canonicalCategory ?? null,
    parent: row.parent ?? null,
    bank_raw: row.bankRaw ?? null,
    market_raw: row.marketRaw ?? null,
    is_macro: row.isMacro ?? false,
    reference_node_id: row.referenceNodeId ?? null,
    reference_department: row.referenceDepartment ?? null,
    reference_depth: row.referenceDepth ?? null,
    row_kind: row.rowKind ?? null,
    rate_ranges: row.rateRanges ?? null,
    rates: row.rates,
  }
}

function apiPartToClient(part: ApiComparisonPart): ComparisonPart {
  return {
    store: part.store,
    rate: part.rate,
    label: part.label,
    nodeId: part.node_id,
    path: part.path,
  }
}

function clientPartToApi(part: ComparisonPart): ApiComparisonPart {
  return {
    store: part.store,
    rate: part.rate,
    label: part.label,
    node_id: part.nodeId,
    path: part.path,
  }
}

export function apiMatrixToClient(matrix: ApiCashbackMatrix): CashbackMatrix {
  return {
    kind: matrix.kind,
    providers: matrix.providers.map((provider) => ({
      key: provider.key,
      name: provider.name,
      slug: provider.slug ?? undefined,
      logo: "",
    })),
    rows: matrix.rows.map(apiRowToClient),
    marketParts: matrix.market_parts?.map(apiPartToClient),
  }
}

export function apiProcessResponseToClient(
  response: ApiProcessSubmissionResponse,
): CashbackMatrix {
  return {
    ...apiMatrixToClient(response.matrix),
    groups: response.groups.map(apiGroupToClient),
  }
}

export function clientMatrixToApi(matrix: CashbackMatrix): ApiCashbackMatrix {
  return {
    kind: matrix.kind,
    providers: matrix.providers.map((provider) => ({
      key: provider.key,
      name: provider.name,
      slug: provider.slug ?? null,
    })),
    rows: matrix.rows.map(clientRowToApi),
    market_parts: matrix.marketParts?.map(clientPartToApi) ?? null,
  }
}

export function enrichMatrixLogos(matrix: CashbackMatrix): CashbackMatrix {
  return {
    ...matrix,
    providers: matrix.providers.map((provider) => resolveProviderLogoFields(provider, matrix.kind)),
  }
}

function resolveProviderLogoFields(provider: MatrixProvider, kind: Kind): MatrixProvider {
  if (provider.logo) return provider
  const logo = provider.slug
    ? getProviderLogoBySlug(provider.slug, kind)
    : resolveProviderLogo(provider.name, kind)
  return { ...provider, logo }
}
