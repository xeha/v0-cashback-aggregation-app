import { describe, it, expect } from "vitest"
import {
  getMarketGroupDisplayLabel,
  getVisibleMarketGroupRows,
  groupHasSubcategories,
  groupMatrixRows,
  isRedundantMarketRowUnderParent,
} from "@/lib/matrix"
import type { ComparisonPart } from "@/lib/market-comparison"
import type { MatrixGroup, MatrixRow } from "@/lib/types"
import { labelsEquivalent } from "@/lib/category-label"

function row(partial: Partial<MatrixRow> & Pick<MatrixRow, "category">): MatrixRow {
  return { rates: {}, ...partial }
}

describe("market group row visibility", () => {
  const parent = "Молочные продукты и яйца"

  it("hides anchor row when it repeats department header", () => {
    const group: MatrixGroup = {
      parent,
      summaryRates: { lenta: 5 },
      rows: [
        row({ category: parent, rowKind: "anchor", rates: { lenta: 5 } }),
        row({ category: "Молоко", rowKind: "item", rates: { lenta: 5 } }),
        row({ category: "Сливки", rowKind: "item", rates: { lenta: 5 } }),
      ],
    }
    expect(getVisibleMarketGroupRows(group).map((r) => r.category)).toEqual([
      "Молоко",
      "Сливки",
    ])
    expect(groupHasSubcategories(group, "market")).toBe(true)
  })

  it("hides coarse item rows that repeat department header", () => {
    const group: MatrixGroup = {
      parent,
      summaryRates: { lenta: 5 },
      rows: [
        row({ category: parent, rowKind: "item", rates: { lenta: 5 } }),
        row({ category: parent, rowKind: "item", rates: { lenta: 5 } }),
      ],
    }
    expect(getVisibleMarketGroupRows(group)).toEqual([])
    expect(groupHasSubcategories(group, "market")).toBe(false)
  })

  it("keeps anchor when it is a narrower comparison level", () => {
    const anchor = "Молоко и молочные напитки"
    expect(
      isRedundantMarketRowUnderParent(
        row({ category: anchor, rowKind: "anchor" }),
        parent,
      ),
    ).toBe(false)
  })
})

function marketPart(
  store: string,
  rate: number,
  label: string,
  pathNames: string[],
): ComparisonPart {
  const path = pathNames.map((name, i) => ({ id: `n${i}:${name}`, name }))
  return { store, rate, label, nodeId: path[path.length - 1].id, path }
}

describe("market group display header", () => {
  it("shows LCA category instead of department for homogeneous alcohol", () => {
    const parts = [
      marketPart("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      marketPart("lenta", 8, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
    ]
    const groups = groupMatrixRows([], parts)
    const group = groups.find((g) => g.parent === "Напитки")!
    expect(labelsEquivalent(getMarketGroupDisplayLabel(group), "Алкогольные напитки")).toBe(
      true,
    )
  })

  it("keeps department header when categories diverge", () => {
    const parts = [
      marketPart("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      marketPart("lenta", 7, "Сок", ["Напитки", "Соки, воды, напитки", "Сок"]),
    ]
    const groups = groupMatrixRows([], parts)
    const group = groups.find((g) => g.parent === "Напитки")!
    expect(getMarketGroupDisplayLabel(group)).toBe("Напитки")
  })

  it("hides anchor when it repeats LCA display header", () => {
    const group: MatrixGroup = {
      parent: "Напитки",
      displayParent: "Алкогольные напитки",
      summaryRates: { magnit: 10, lenta: 8 },
      rows: [
        row({
          category: "Алкогольные напитки",
          rowKind: "anchor",
          rates: { magnit: 10, lenta: 8 },
        }),
        row({ category: "Пиво", rowKind: "item", rates: { magnit: 10 } }),
        row({ category: "Сидр", rowKind: "item", rates: { lenta: 8 } }),
      ],
    }
    expect(getVisibleMarketGroupRows(group).map((r) => r.category)).toEqual([
      "Пиво",
      "Сидр",
    ])
  })
})
