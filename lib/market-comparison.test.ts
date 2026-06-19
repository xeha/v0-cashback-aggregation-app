import { describe, it, expect } from "vitest"
import { buildMarketGroups, type ComparisonPart } from "@/lib/market-comparison"

function part(
  store: string,
  rate: number,
  label: string,
  pathNames: string[],
): ComparisonPart {
  const path = pathNames.map((name, i) => ({ id: `n${i}:${name}`, name }))
  return { store, rate, label, nodeId: path[path.length - 1].id, path }
}

describe("buildMarketGroups", () => {
  it("anchors at category when stores share it", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("magnit", 10, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
      part("lenta", 8, "Шампанское", ["Напитки", "Алкогольные напитки", "Шампанское"]),
    ]
    const groups = buildMarketGroups(parts)
    const napitki = groups.find((g) => g.parent === "Напитки")!
    const anchor = napitki.rows.find((r) => r.kind === "anchor")!
    expect(anchor.label).toBe("Алкогольные напитки")
  })

  it("anchors at department when stores diverge", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("lenta", 7, "Лимонад", ["Напитки", "Сладкие газированные напитки", "Лимонад"]),
    ]
    const groups = buildMarketGroups(parts)
    const anchor = groups[0].rows.find((r) => r.kind === "anchor")!
    expect(anchor.label).toBe("Напитки")
  })

  it("keeps item rows for every part", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("lenta", 7, "Лимонад", ["Напитки", "Сладкие газированные напитки", "Лимонад"]),
    ]
    const groups = buildMarketGroups(parts)
    const items = groups[0].rows.filter((r) => r.kind === "item").map((r) => r.label)
    expect(items.sort()).toEqual(["Лимонад", "Пиво"])
  })

  it("anchor rate shows min-max range per store", () => {
    const parts = [
      part("magnit", 5, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("magnit", 10, "Сидр", ["Напитки", "Алкогольные напитки", "Сидр"]),
      part("lenta", 8, "Вино", ["Напитки", "Алкогольные напитки", "Вино"]),
    ]
    const groups = buildMarketGroups(parts)
    const anchor = groups[0].rows.find((r) => r.kind === "anchor")!
    expect(anchor.rateRanges.magnit).toEqual({ min: 5, max: 10 })
    expect(anchor.rateRanges.lenta).toEqual({ min: 8, max: 8 })
  })

  it("does not compare across departments", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("lenta", 7, "Хлеб", ["Хлеб и выпечка", "Хлеб", "Батон"]),
    ]
    const groups = buildMarketGroups(parts)
    expect(groups.map((g) => g.parent).sort()).toEqual([
      "Напитки",
      "Хлеб и выпечка",
    ])
  })

  it("no anchor when only one store in department", () => {
    const parts = [
      part("magnit", 10, "Пиво", ["Напитки", "Алкогольные напитки", "Пиво"]),
      part("magnit", 5, "Вода", ["Напитки", "Вода", "Минеральная вода"]),
    ]
    const groups = buildMarketGroups(parts)
    const anchors = groups[0].rows.filter((r) => r.kind === "anchor")
    expect(anchors.length).toBe(0)
  })
})
