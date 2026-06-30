import type {
  CashbackMatrix,
  CashbackPeriod,
  MatrixState,
  ProcessingSummary,
  SourceSubmission,
} from "@/lib/types"
import type PocketBase from "pocketbase"

export interface SavedMatrixSummary {
  id: string
  title: string
  periodMonth?: number
  periodYear?: number
  updated: string
  bankCount: number
  marketCount: number
  categoryCount: number
  isFavorite: boolean
}

export interface SavedMatrixRecord extends SavedMatrixSummary {
  bank_matrix: CashbackMatrix | null
  market_matrix: CashbackMatrix | null
  submissions: SourceSubmission[]
  summary: ProcessingSummary
}

type PocketBaseSavedMatrixRecord = {
  id: string
  title: string
  period_month?: number
  period_year?: number
  updated: string
  created: string
  is_favorite?: boolean
  bank_matrix?: CashbackMatrix | null
  market_matrix?: CashbackMatrix | null
  submissions?: SourceSubmission[]
  summary?: ProcessingSummary
}

function countMatrixProviders(matrix: CashbackMatrix | null | undefined): number {
  const names = new Set<string>()
  for (const provider of matrix?.providers ?? []) {
    names.add(provider.name)
  }
  return names.size
}

function countCategories(
  bankMatrix: CashbackMatrix | null | undefined,
  marketMatrix: CashbackMatrix | null | undefined,
): number {
  return (bankMatrix?.rows.length ?? 0) + (marketMatrix?.rows.length ?? 0)
}

function recordToSummary(record: PocketBaseSavedMatrixRecord): SavedMatrixSummary {
  const periodFallback =
    record.period_year && record.period_month
      ? new Date(record.period_year, record.period_month - 1, 15).toISOString()
      : ""

  return {
    id: record.id,
    title: record.title,
    periodMonth: record.period_month,
    periodYear: record.period_year,
    updated: record.updated || record.created || periodFallback,
    bankCount: countMatrixProviders(record.bank_matrix),
    marketCount: countMatrixProviders(record.market_matrix),
    categoryCount: countCategories(record.bank_matrix, record.market_matrix),
    isFavorite: record.is_favorite ?? false,
  }
}

function recordToFull(record: PocketBaseSavedMatrixRecord): SavedMatrixRecord {
  const summary = recordToSummary(record)
  return {
    ...summary,
    bank_matrix: record.bank_matrix ?? null,
    market_matrix: record.market_matrix ?? null,
    submissions: record.submissions ?? [],
    summary: record.summary ?? { skipped: [], lowConfidence: [], bankOffers: [] },
  }
}

function requireUserId(pb: PocketBase): string {
  const userId = pb.authStore.record?.id
  if (!userId) {
    throw new Error("Требуется вход")
  }
  return userId
}

function periodSortKey(summary: SavedMatrixSummary): number {
  return (summary.periodYear ?? 0) * 100 + (summary.periodMonth ?? 0)
}

export async function listSavedMatrices(pb: PocketBase): Promise<SavedMatrixSummary[]> {
  requireUserId(pb)

  // PocketBase returns 400 for sort on system date fields on this collection.
  const result = await pb.collection("saved_matrices").getList<PocketBaseSavedMatrixRecord>(1, 50, {
    fields: "id,title,period_month,period_year,is_favorite,bank_matrix,market_matrix",
  })

  return result.items
    .map(recordToSummary)
    .sort((a, b) => periodSortKey(b) - periodSortKey(a) || b.title.localeCompare(a.title, "ru"))
}

export async function getSavedMatrix(pb: PocketBase, id: string): Promise<SavedMatrixRecord> {
  requireUserId(pb)
  const record = await pb.collection("saved_matrices").getOne<PocketBaseSavedMatrixRecord>(id)
  return recordToFull(record)
}

export async function saveMatrix(
  pb: PocketBase,
  payload: {
    matrix: MatrixState
    submissions: SourceSubmission[]
    summary: ProcessingSummary
    period: CashbackPeriod
    title?: string
  },
) {
  const { month, year } = payload.period
  const userId = requireUserId(pb)

  return pb.collection("saved_matrices").create({
    user: userId,
    title: payload.title ?? `Кешбэк ${month}.${year}`,
    period_month: month,
    period_year: year,
    bank_matrix: payload.matrix.bank,
    market_matrix: payload.matrix.market,
    submissions: payload.submissions,
    summary: payload.summary,
    is_favorite: false,
  })
}

export async function updateSavedMatrix(
  pb: PocketBase,
  id: string,
  payload: {
    matrix: MatrixState
    submissions: SourceSubmission[]
    summary: ProcessingSummary
  },
) {
  requireUserId(pb)

  return pb.collection("saved_matrices").update(id, {
    bank_matrix: payload.matrix.bank,
    market_matrix: payload.matrix.market,
    submissions: payload.submissions,
    summary: payload.summary,
  })
}
