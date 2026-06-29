import { describe, expect, it } from "vitest"
import {
  formatRelativeUpdated,
  formatSaveMetaLine,
} from "@/lib/saved-matrix-meta"
import type { SavedMatrixSummary } from "@/lib/saved-matrices"

describe("formatRelativeUpdated", () => {
  const now = new Date("2026-06-29T12:00:00")

  it("returns сегодня for same calendar day", () => {
    expect(formatRelativeUpdated("2026-06-29T08:00:00", now)).toBe("сегодня")
  })

  it("returns вчера for previous day", () => {
    expect(formatRelativeUpdated("2026-06-28T20:00:00", now)).toBe("вчера")
  })

  it("returns N дней назад within a week", () => {
    expect(formatRelativeUpdated("2026-06-26T10:00:00", now)).toBe("3 дня назад")
  })

  it("returns DD.MM.YYYY for older dates", () => {
    expect(formatRelativeUpdated("2026-05-01T10:00:00", now)).toBe("01.05.2026")
  })
})

describe("formatSaveMetaLine", () => {
  it("joins provider, category and relative date", () => {
    const summary: SavedMatrixSummary = {
      id: "1",
      title: "Кешбэк 6.2026",
      updated: "2026-06-28T10:00:00",
      providerCount: 3,
      categoryCount: 12,
      isFavorite: false,
    }
    const line = formatSaveMetaLine(summary)
    expect(line).toContain("3 банка")
    expect(line).toContain("12 категорий")
    expect(line).toContain("обновлено")
  })
})
