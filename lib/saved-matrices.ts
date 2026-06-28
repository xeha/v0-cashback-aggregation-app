import type { MatrixState, ProcessingSummary, SourceSubmission } from "@/lib/types"
import type PocketBase from "pocketbase"

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
  const userId = pb.authStore.record?.id

  if (!userId) {
    throw new Error("Требуется вход")
  }

  return pb.collection("saved_matrices").create({
    user: userId,
    title: payload.title ?? `Кэшбэк ${month}.${year}`,
    period_month: month,
    period_year: year,
    bank_matrix: payload.matrix.bank,
    market_matrix: payload.matrix.market,
    submissions: payload.submissions,
    summary: payload.summary,
    is_favorite: false,
  })
}
