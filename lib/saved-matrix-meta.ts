import type { SavedMatrixSummary } from "@/lib/saved-matrices"

function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function formatRelativeUpdated(isoDate: string, now = new Date()): string {
  const updated = new Date(isoDate)
  if (Number.isNaN(updated.getTime())) return ""

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfUpdated = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate())
  const dayDiff = Math.round((startOfToday.getTime() - startOfUpdated.getTime()) / 86_400_000)

  if (dayDiff === 0) return "сегодня"
  if (dayDiff === 1) return "вчера"
  if (dayDiff > 1 && dayDiff < 7) {
    return `${dayDiff} ${pluralRu(dayDiff, "день", "дня", "дней")} назад`
  }

  const day = String(updated.getDate()).padStart(2, "0")
  const month = String(updated.getMonth() + 1).padStart(2, "0")
  const year = updated.getFullYear()
  return `${day}.${month}.${year}`
}

export function formatProviderCount(count: number): string {
  return `${count} ${pluralRu(count, "банк", "банка", "банков")}`
}

export function formatCategoryCount(count: number): string {
  return `${count} ${pluralRu(count, "категория", "категории", "категорий")}`
}

export function formatSaveMetaLine(summary: SavedMatrixSummary): string {
  const parts = [
    formatProviderCount(summary.providerCount),
    formatCategoryCount(summary.categoryCount),
    `обновлено ${formatRelativeUpdated(summary.updated)}`,
  ]
  return parts.join(" · ")
}
