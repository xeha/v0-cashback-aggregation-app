/** UI-only matrix helpers. Domain merge lives in backend/services/matrix_merge_service.py */

import {
  formatCategoryLabel,
  labelsEquivalent,
  normalizeCategoryLabel,
} from "@/lib/category-label"
import { REFERENCE_HIERARCHY_DEPARTMENT_ORDER } from "@/lib/reference-hierarchy-order"
import {
  buildMarketGroups,
  partsInAnchorSubtree,
  resolveMarketDisplayAnchor,
  summaryRatesForParts,
  type ComparisonPart,
} from "@/lib/market-comparison"
import type { Kind, MatrixGroup, MatrixRow } from "@/lib/types"

function consolidateGroupRows(rows: MatrixRow[]): MatrixRow[] {
  const macroByParent = new Map<string, MatrixRow>()
  const leaves: MatrixRow[] = []

  for (const row of rows) {
    const isMacroRow =
      row.isMacro ||
      Boolean(row.parent && labelsEquivalent(row.category, row.parent))

    if (isMacroRow && row.parent) {
      const key = normalizeCategoryLabel(row.parent)
      const existing = macroByParent.get(key)
      if (existing) {
        existing.rates = { ...existing.rates, ...row.rates }
        existing.bankRaw = undefined
        existing.isMacro = true
      } else {
        macroByParent.set(key, {
          ...row,
          category: formatCategoryLabel(row.parent),
          isMacro: true,
          bankRaw: undefined,
          rates: { ...row.rates },
        })
      }
      continue
    }

    leaves.push(row)
  }

  return [...macroByParent.values(), ...leaves]
}

export function countProvidersInGroup(group: MatrixGroup): number {
  const keys = new Set<string>()
  for (const row of group.rows) {
    for (const key of Object.keys(row.rates)) {
      keys.add(key)
    }
  }
  for (const key of Object.keys(group.summaryRates)) {
    keys.add(key)
  }
  return keys.size
}

/** Single market in a department → OCR name; multiple markets → canonical label for comparison. */
export function resolveMarketRowCategory(
  row: MatrixRow,
  providerCountInGroup: number,
): string {
  if (providerCountInGroup <= 1 && row.marketRaw) {
    return formatCategoryLabel(row.marketRaw)
  }
  return row.category
}

export function isMacroOnlyGroup(group: MatrixGroup): boolean {
  if (typeof group.isMacroOnly === "boolean") return group.isMacroOnly
  if (group.rows.length === 0) return false
  return group.rows.every((row) => {
    if (row.isMacro) return true
    if (row.parent && labelsEquivalent(row.category, row.parent)) return true
    return false
  })
}

/** LCA anchor or coarse item that repeats the department header label. */
export function isRedundantMarketRowUnderParent(row: MatrixRow, parent: string): boolean {
  if (row.rowKind === "anchor" && labelsEquivalent(row.category, parent)) return true
  if (labelsEquivalent(row.category, parent)) return true
  return false
}

export function getMarketGroupDisplayLabel(group: MatrixGroup): string {
  return group.displayParent ?? group.parent
}

export function getVisibleMarketGroupRows(group: MatrixGroup): MatrixRow[] {
  const displayParent = getMarketGroupDisplayLabel(group)
  return group.rows.filter(
    (row) => !isRedundantMarketRowUnderParent(row, displayParent),
  )
}

/** Macro header row that only repeats the parent label (e.g. «Для Детей»). */
export function isRedundantBankMacroRowUnderParent(row: MatrixRow, parent: string): boolean {
  if (!row.isMacro) return false
  return labelsEquivalent(row.category, parent)
}

export function getVisibleBankGroupRows(group: MatrixGroup): MatrixRow[] {
  const parentLabel = formatCategoryLabel(group.parent)
  const children = group.rows.filter(
    (row) => !isRedundantBankMacroRowUnderParent(row, parentLabel),
  )
  return children.length > 0 ? children : group.rows
}

/** Parent row is flat; subcategories expand on chevron click. */
export function groupHasSubcategories(group: MatrixGroup, kind: Kind = "bank"): boolean {
  const rows =
    kind === "market" ? getVisibleMarketGroupRows(group) : getVisibleBankGroupRows(group)
  if (rows.length === 0) return false
  return !isMacroOnlyGroup({ ...group, rows })
}

/** Macro rows mapped to L1 but with a narrower OCR label (e.g. «Мясо») stay visible as children. */
function visibleMacroChildren(parent: string, macroRows: MatrixRow[]): MatrixRow[] {
  return macroRows.filter((row) => {
    const ocrLabel = row.marketRaw?.trim()
    if (ocrLabel && !labelsEquivalent(ocrLabel, parent)) return true
    return !labelsEquivalent(row.category, parent)
  })
}

function formatRange(range: { min: number; max: number }): number {
  return range.max
}

function buildMarketGroupsAsMatrix(parts: ComparisonPart[]): MatrixGroup[] {
  const orderIndex = new Map(
    REFERENCE_HIERARCHY_DEPARTMENT_ORDER.map((name, index) => [
      normalizeCategoryLabel(name),
      index,
    ]),
  )
  const byDepartment = new Map<string, ComparisonPart[]>()
  for (const part of parts) {
    if (part.path.length === 0) continue
    const dept = part.path[0].name
    const list = byDepartment.get(dept) ?? []
    list.push(part)
    byDepartment.set(dept, list)
  }

  const groups = buildMarketGroups(parts).map((group) => {
    const deptParts = byDepartment.get(group.parent) ?? []
    const { depth: displayDepth, label: displayAnchorLabel } =
      resolveMarketDisplayAnchor(deptParts)
    const displayParent =
      displayDepth > 0 ? formatCategoryLabel(displayAnchorLabel) : group.parent
    const summaryParts =
      displayDepth > 0
        ? partsInAnchorSubtree(deptParts, displayDepth)
        : deptParts
    const summaryRates = summaryRatesForParts(summaryParts)

    const rows: MatrixRow[] = []
    for (const row of group.rows) {
      if (row.kind === "anchor") {
        const rates: Record<string, number> = {}
        for (const [store, range] of Object.entries(row.rateRanges)) {
          rates[store] = formatRange(range)
        }
        rows.push({
          category: formatCategoryLabel(row.label),
          parent: group.parent,
          rowKind: "anchor",
          referenceDepartment: group.parent,
          referenceNodeId: row.nodeId,
          rateRanges: row.rateRanges,
          rates,
        })
      } else {
        rows.push({
          category: formatCategoryLabel(row.label),
          parent: group.parent,
          rowKind: "item",
          referenceDepartment: group.parent,
          referenceNodeId: row.nodeId,
          rates: { [row.store]: row.rate },
        })
      }
    }
    return {
      parent: group.parent,
      displayParent: displayParent !== group.parent ? displayParent : undefined,
      summaryRates,
      rows,
      isMacroOnly: rows.every((r) => r.rowKind === "anchor"),
    } satisfies MatrixGroup
  })
  return groups.sort((a, b) => {
    const aOrder = orderIndex.get(normalizeCategoryLabel(a.parent)) ?? Number.MAX_SAFE_INTEGER
    const bOrder = orderIndex.get(normalizeCategoryLabel(b.parent)) ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.parent.localeCompare(b.parent, "ru")
  })
}

export function groupMatrixRows(
  rows: MatrixRow[],
  marketParts?: ComparisonPart[],
): MatrixGroup[] {
  if (marketParts && marketParts.length > 0) {
    return buildMarketGroupsAsMatrix(marketParts)
  }

  const hasReferenceHierarchyRows = rows.some(
    (row) => Boolean(row.referenceDepartment) || typeof row.referenceDepth === "number",
  )
  if (hasReferenceHierarchyRows) {
    const byDepartment = new Map<
      string,
      { parent: string; macroRows: MatrixRow[]; childRows: MatrixRow[] }
    >()

    for (const row of rows) {
      const parentLabel = row.referenceDepartment ?? row.parent ?? row.category
      const parentKey = normalizeCategoryLabel(parentLabel)
      const entry = byDepartment.get(parentKey) ?? {
        parent: parentLabel,
        macroRows: [],
        childRows: [],
      }
      if (!entry.parent) entry.parent = parentLabel

      const depth = row.referenceDepth
      const isMacroRow = depth === 1 || row.isMacro === true
      if (isMacroRow) {
        entry.macroRows.push(row)
      } else {
        entry.childRows.push(row)
      }

      byDepartment.set(parentKey, entry)
    }

    const orderIndex = new Map(
      REFERENCE_HIERARCHY_DEPARTMENT_ORDER.map((name, index) => [
        normalizeCategoryLabel(name),
        index,
      ]),
    )

    const groups = Array.from(byDepartment.values()).map(({ parent, macroRows, childRows }) => {
      const summaryRates: Record<string, number> = {}
      for (const row of [...macroRows, ...childRows]) {
        for (const [key, rate] of Object.entries(row.rates)) {
          summaryRates[key] = Math.max(summaryRates[key] ?? 0, rate)
        }
      }

      const sortedChildren = [...childRows].sort((a, b) => {
        const depthA = a.referenceDepth ?? 99
        const depthB = b.referenceDepth ?? 99
        if (depthA !== depthB) return depthA - depthB
        return a.category.localeCompare(b.category, "ru")
      })

      const macroChildren = visibleMacroChildren(parent, macroRows)
      const displayRows =
        sortedChildren.length > 0
          ? [...sortedChildren, ...macroChildren].sort((a, b) => {
              const depthA = a.referenceDepth ?? 99
              const depthB = b.referenceDepth ?? 99
              if (depthA !== depthB) return depthA - depthB
              const labelA = a.marketRaw ?? a.category
              const labelB = b.marketRaw ?? b.category
              return labelA.localeCompare(labelB, "ru")
            })
          : macroRows

      return {
        parent,
        summaryRates,
        rows: displayRows,
        isMacroOnly: sortedChildren.length === 0 && macroChildren.length === 0,
      } satisfies MatrixGroup
    })

    return groups.sort((a, b) => {
      const aKey = normalizeCategoryLabel(a.parent)
      const bKey = normalizeCategoryLabel(b.parent)
      const aOrder = orderIndex.get(aKey) ?? Number.MAX_SAFE_INTEGER
      const bOrder = orderIndex.get(bKey) ?? Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.parent.localeCompare(b.parent, "ru")
    })
  }

  const byParent = new Map<string, { parent: string; rows: MatrixRow[] }>()
  for (const row of rows) {
    const parentLabel = row.parent ?? row.category
    const parentKey = normalizeCategoryLabel(parentLabel)
    const entry = byParent.get(parentKey) ?? {
      parent: row.parent ?? parentLabel,
      rows: [],
    }
    if (!entry.parent && row.parent) entry.parent = row.parent
    entry.rows.push(row)
    byParent.set(parentKey, entry)
  }
  return Array.from(byParent.values()).map(({ parent, rows }) => {
    const children = consolidateGroupRows(rows)
    const summaryRates: Record<string, number> = {}
    for (const child of children) {
      for (const [key, rate] of Object.entries(child.rates)) {
        summaryRates[key] = Math.max(summaryRates[key] ?? 0, rate)
      }
    }
    const group: MatrixGroup = { parent, summaryRates, rows: children }
    group.isMacroOnly = isMacroOnlyGroup(group)
    return group
  })
}
