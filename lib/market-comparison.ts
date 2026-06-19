export interface RefPathNode {
  id: string
  name: string
}

export interface ComparisonPart {
  store: string
  rate: number
  label: string
  nodeId: string
  /** Путь от отдела (index 0) до узла (последний элемент). */
  path: RefPathNode[]
}

export interface RateRange {
  min: number
  max: number
}

export interface ComparisonAnchorRow {
  kind: "anchor"
  nodeId: string
  label: string
  rateRanges: Record<string, RateRange>
}

export interface ComparisonItemRow {
  kind: "item"
  nodeId: string
  label: string
  store: string
  rate: number
}

export type ComparisonRow = ComparisonAnchorRow | ComparisonItemRow

export interface ComparisonGroup {
  parent: string
  rows: ComparisonRow[]
}

function storesUnder(parts: ComparisonPart[]): Set<string> {
  return new Set(parts.map((p) => p.store))
}

/** Спуск: пока один ребёнок покрывает все магазины родителя — идём вниз. */
function findAnchorDepth(parts: ComparisonPart[]): number {
  const totalStores = storesUnder(parts)
  let depth = 0
  for (;;) {
    const byChild = new Map<string, ComparisonPart[]>()
    for (const part of parts) {
      const child = part.path[depth + 1]
      if (!child) {
        return depth
      }
      const list = byChild.get(child.id) ?? []
      list.push(part)
      byChild.set(child.id, list)
    }
    let descended = false
    for (const childParts of byChild.values()) {
      if (storesUnder(childParts).size === totalStores.size && byChild.size === 1) {
        depth += 1
        descended = true
        break
      }
    }
    if (!descended) return depth
  }
}

function rangeFor(parts: ComparisonPart[]): Record<string, RateRange> {
  const ranges: Record<string, RateRange> = {}
  for (const part of parts) {
    const current = ranges[part.store]
    if (!current) {
      ranges[part.store] = { min: part.rate, max: part.rate }
    } else {
      current.min = Math.min(current.min, part.rate)
      current.max = Math.max(current.max, part.rate)
    }
  }
  return ranges
}

export function buildMarketGroups(parts: ComparisonPart[]): ComparisonGroup[] {
  const byDepartment = new Map<string, ComparisonPart[]>()
  for (const part of parts) {
    if (part.path.length === 0) continue
    const dept = part.path[0].name
    const list = byDepartment.get(dept) ?? []
    list.push(part)
    byDepartment.set(dept, list)
  }

  const groups: ComparisonGroup[] = []
  for (const [parent, deptParts] of byDepartment) {
    const rows: ComparisonRow[] = []
    const storeCount = storesUnder(deptParts).size

    if (storeCount >= 2) {
      const depth = findAnchorDepth(deptParts)
      const anchorNode = deptParts[0].path[depth]
      rows.push({
        kind: "anchor",
        nodeId: anchorNode.id,
        label: anchorNode.name,
        rateRanges: rangeFor(deptParts),
      })
    }

    for (const part of deptParts) {
      rows.push({
        kind: "item",
        nodeId: part.nodeId,
        label: part.label,
        store: part.store,
        rate: part.rate,
      })
    }
    groups.push({ parent, rows })
  }

  return groups.sort((a, b) => a.parent.localeCompare(b.parent, "ru"))
}
