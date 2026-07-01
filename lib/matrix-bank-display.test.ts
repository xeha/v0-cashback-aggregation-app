import { describe, it, expect } from "vitest"
import {
  getVisibleBankGroupRows,
  groupHasSubcategories,
  groupMatrixRows,
} from "@/lib/matrix"
import { labelsEquivalent, formatCategoryLabel } from "@/lib/category-label"

describe("bank retailer under macro parent", () => {
  it("creates expandable child row for store mapped to parent category", () => {
    const rows = [
      {
        category: formatCategoryLabel("Для Детей"),
        parent: "Для Детей",
        isMacro: true,
        rates: { alfa: 7 },
      },
      {
        category: formatCategoryLabel("Детский мир"),
        parent: "Для Детей",
        isMacro: false,
        rates: { alfa: 7 },
      },
    ]
    const groups = groupMatrixRows(rows)
    const group = groups.find((g) => labelsEquivalent(g.parent, "Для Детей"))!

    expect(getVisibleBankGroupRows(group).map((r) => r.category)).toEqual([
      formatCategoryLabel("Детский мир"),
    ])
    expect(groupHasSubcategories(group, "bank")).toBe(true)
    expect(group.summaryRates.alfa).toBe(7)
  })

  it("stays flat when macro label matches OCR text", () => {
    const rows = [
      {
        category: formatCategoryLabel("Для Детей"),
        parent: "Для Детей",
        isMacro: true,
        rates: { alfa: 5 },
      },
    ]
    const groups = groupMatrixRows(rows)
    const group = groups.find((g) => labelsEquivalent(g.parent, "Для Детей"))!

    expect(getVisibleBankGroupRows(group)).toHaveLength(1)
    expect(groupHasSubcategories(group, "bank")).toBe(false)
  })
})
