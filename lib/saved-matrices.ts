import type {
  CashbackMatrix,
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
  providerCount: number
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

function countProviders(
  bankMatrix: CashbackMatrix | null | undefined,
  marketMatrix: CashbackMatrix | null | undefined,
): number {
  const names = new Set<string>()
  for (const provider of bankMatrix?.providers ?? []) {
    names.add(provider.name)
  }
  for (const provider of marketMatrix?.providers ?? []) {
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
  return {
    id: record.id,
    title: record.title,
    periodMonth: record.period_month,
    periodYear: record.period_year,
    updated: record.updated || record.created,
    providerCount: countProviders(record.bank_matrix, record.market_matrix),
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

export async function listSavedMatrices(pb: PocketBase): Promise<SavedMatrixSummary[]> {
  requireUserId(pb)

  const result = await pb.collection("saved_matrices").getList<PocketBaseSavedMatrixRecord>(1, 50, {
    sort: "-updated",
  })

  return result.items.map(recordToSummary)
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
    title?: string
  },
) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
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
