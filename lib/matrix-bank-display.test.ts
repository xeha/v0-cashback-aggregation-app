import { describe, it, expect } from "vitest"
import {
  getVisibleBankGroupRows,
  groupHasSubcategories,
  groupMatrixRows,
  mergeMappedItems,
} from "@/lib/matrix"
import type { MappedItem, MatrixProvider } from "@/lib/types"
import { labelsEquivalent, formatCategoryLabel } from "@/lib/category-label"

const alfa: MatrixProvider = { key: "alfa", name: "Альфа-Банк", logo: "" }

function detmirItem(): MappedItem {
  return {
    raw_category: "Детский мир",
    unified_category: "Для Детей",
    unified_subcategory: "Для Детей",
    unified_parent: "Для Детей",
    rate: 7,
    confidence: 1,
    is_macro_category: true,
  }
}

describe("bank retailer under macro parent", () => {
  it("creates expandable child row for store mapped to parent category", () => {
    const matrix = mergeMappedItems(null, alfa, [detmirItem()], "bank")
    const groups = groupMatrixRows(matrix.rows)
    const group = groups.find((g) => labelsEquivalent(g.parent, "Для Детей"))!

    expect(getVisibleBankGroupRows(group).map((r) => r.category)).toEqual([
      formatCategoryLabel("Детский мир"),
    ])
    expect(groupHasSubcategories(group, "bank")).toBe(true)
    expect(group.summaryRates.alfa).toBe(7)
  })

  it("stays flat when macro label matches OCR text", () => {
    const matrix = mergeMappedItems(
      null,
      alfa,
      [
        {
          raw_category: "Для детей",
          unified_category: "Для Детей",
          unified_subcategory: "Для Детей",
          unified_parent: "Для Детей",
          rate: 5,
          confidence: 1,
          is_macro_category: true,
        },
      ],
      "bank",
    )
    const groups = groupMatrixRows(matrix.rows)
    const group = groups.find((g) => labelsEquivalent(g.parent, "Для Детей"))!

    expect(getVisibleBankGroupRows(group)).toHaveLength(1)
    expect(groupHasSubcategories(group, "bank")).toBe(false)
  })
})
