import {
  getProviderLogoBySlug,
  providerNamesMatch,
  resolveProviderLogo,
} from "@/lib/provider-logos"
import {
  formatCategoryLabel,
  labelsEquivalent,
  normalizeCategoryLabel,
} from "@/lib/category-label"
import { REFERENCE_HIERARCHY_DEPARTMENT_ORDER } from "@/lib/reference-hierarchy-order"
import type {
  CashbackMatrix,
  Kind,
  MappedItem,
  MatrixGroup,
  MatrixProvider,
  MatrixRow,
  SourceSubmission,
} from "@/lib/types"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "provider"
}

export function buildProviderKey(name: string, existingKeys: Set<string>): string {
  const base = slugify(name)
  let key = base
  let counter = 2
  while (existingKeys.has(key)) {
    key = `${base}-${counter}`
    counter += 1
  }
  return key
}

function resolveBankRowKey(
  isMacro: boolean,
  parent: string | undefined,
  canonicalLabel: string,
): string {
  if (isMacro && parent) {
    return `macro::${normalizeCategoryLabel(parent)}`
  }
  return `leaf::${normalizeCategoryLabel(canonicalLabel)}`
}

function rowKeyFromExisting(row: MatrixRow, kind: Kind): string {
  if (kind === "market" && row.referenceNodeId && row.referenceDepth !== undefined) {
    return marketRowKeyFromExisting(row)
  }
  if (row.isMacro && row.parent) {
    return `macro::${normalizeCategoryLabel(row.parent)}`
  }
  const canonical = row.canonicalCategory ?? row.category
  return `leaf::${normalizeCategoryLabel(canonical)}`
}

function resolveBankDisplayLabel(item: MappedItem, canonical: string, isMacro: boolean): string {
  const parent = item.unified_parent
  if (isMacro && parent) {
    if (item.unified_category && !labelsEquivalent(item.unified_category, canonical)) {
      return item.unified_category
    }
    return parent
  }
  if (item.unified_category && !labelsEquivalent(item.unified_category, canonical)) {
    return item.unified_category
  }
  return canonical
}

function getReferenceDepth(item: MappedItem): number {
  if (typeof item.reference_depth === "number") return item.reference_depth
  if (item.reference_subcategory) return 3
  if (item.reference_category) return 2
  return 1
}

type MarketComparisonAnchor = {
  nodeId: string
  depth: number
  categoryLabel: string
  departmentLabel?: string
}

function parseReferenceNodeId(nodeId: string): {
  departmentId: string
  categoryId?: string
} {
  const parts = nodeId.split(".")
  const departmentId = parts[0] ?? nodeId
  const categoryId = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : undefined
  return { departmentId, categoryId }
}

/** Normalize L3 (and mixed-depth) mappings to L2 category for cross-store row merge. */
function resolveMarketComparisonAnchor(item: MappedItem): MarketComparisonAnchor {
  const sourceDepth = getReferenceDepth(item)
  const nodeId = item.reference_node_id?.trim()
  const departmentLabel = item.reference_department ?? item.unified_parent

  if (!nodeId) {
    const categoryLabel = formatCategoryLabel(item.display_label ?? item.unified_category)
    return {
      nodeId: `unknown::${normalizeCategoryLabel(categoryLabel)}`,
      depth: sourceDepth,
      categoryLabel,
      departmentLabel,
    }
  }

  const { departmentId, categoryId } = parseReferenceNodeId(nodeId)

  if (sourceDepth === 1) {
    return {
      nodeId: departmentId,
      depth: 1,
      categoryLabel: formatCategoryLabel(departmentLabel ?? item.display_label ?? item.unified_category),
      departmentLabel,
    }
  }

  const compareNodeId = categoryId ?? nodeId
  const categoryLabel = formatCategoryLabel(
    item.reference_category ?? item.display_label ?? item.unified_category,
  )

  return {
    nodeId: compareNodeId,
    depth: 2,
    categoryLabel,
    departmentLabel,
  }
}

function marketRowKeyFromAnchor(anchor: MarketComparisonAnchor): string {
  return `ref::${anchor.nodeId}::${anchor.depth}`
}

function resolveMarketRowKey(item: MappedItem): string {
  return marketRowKeyFromAnchor(resolveMarketComparisonAnchor(item))
}

function marketRowKeyFromExisting(row: MatrixRow): string {
  return resolveMarketRowKey({
    raw_category: row.marketRaw ?? row.category,
    unified_category: row.category,
    unified_parent: row.referenceDepartment ?? row.parent,
    reference_node_id: row.referenceNodeId,
    reference_department: row.referenceDepartment,
    reference_category: row.referenceCategory,
    reference_subcategory: row.referenceSubcategory,
    reference_depth: row.referenceDepth,
    display_label: row.referenceCategory ?? row.category,
    rate: 0,
    confidence: 0,
  })
}

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

export function mergeMappedItems(
  matrix: CashbackMatrix | null,
  provider: MatrixProvider,
  items: MappedItem[],
  kind: Kind,
): CashbackMatrix {
  const rowMap = new Map<string, MatrixRow>()

  if (matrix && matrix.kind === kind) {
    for (const row of matrix.rows) {
      const key = rowKeyFromExisting(row, kind)
      rowMap.set(key, {
        ...row,
        rates: { ...row.rates },
      })
    }
  }

  for (const item of items) {
    if (item.is_bank_offer) continue

    if (kind === "market") {
      const anchor = resolveMarketComparisonAnchor(item)
      const displayLabel = anchor.categoryLabel
      const rowKey = resolveMarketRowKey(item)
      const referenceDepartment = anchor.departmentLabel ?? item.unified_parent
      const raw = item.raw_category.trim()
      const marketRaw =
        raw &&
        !labelsEquivalent(raw, displayLabel) &&
        !(referenceDepartment && labelsEquivalent(raw, referenceDepartment))
          ? raw
          : undefined
      const existing = rowMap.get(rowKey) ?? {
        category: displayLabel,
        parent: referenceDepartment,
        isMacro: anchor.depth === 1,
        referenceNodeId: anchor.nodeId,
        referenceDepartment,
        referenceCategory: anchor.depth >= 2 ? displayLabel : undefined,
        referenceSubcategory: undefined,
        referenceDepth: anchor.depth,
        rates: {},
      }

      const hadThisProvider = provider.key in existing.rates
      const hadOtherProviders = Object.keys(existing.rates).some(
        (key) => key !== provider.key,
      )
      existing.rates[provider.key] = item.rate
      if (!existing.parent && referenceDepartment) existing.parent = referenceDepartment
      if (!existing.referenceDepartment && referenceDepartment) {
        existing.referenceDepartment = referenceDepartment
      }
      existing.referenceNodeId = anchor.nodeId
      existing.referenceDepth = anchor.depth
      existing.isMacro = anchor.depth === 1
      existing.category = displayLabel
      if (anchor.depth >= 2) {
        existing.referenceCategory = displayLabel
        existing.referenceSubcategory = undefined
      } else {
        existing.referenceCategory = undefined
        existing.referenceSubcategory = undefined
      }
      if (marketRaw && !hadThisProvider) {
        existing.marketRaw = marketRaw
      } else if (hadOtherProviders) {
        existing.marketRaw = undefined
      }

      rowMap.set(rowKey, existing)
      continue
    }

    const isMacro = item.is_macro_category ?? false
    const parent = item.unified_parent
    const canonical = item.unified_subcategory ?? item.unified_category
    const displayLabel = resolveBankDisplayLabel(item, canonical, isMacro)
    const displayCategory = formatCategoryLabel(displayLabel)
    const raw = item.raw_category.trim()
    const bankRaw =
      raw &&
      !labelsEquivalent(raw, displayCategory) &&
      !labelsEquivalent(raw, canonical)
        ? raw
        : undefined
    const rowKey = resolveBankRowKey(
      isMacro,
      parent,
      isMacro && parent ? parent : canonical,
    )

    const existing = rowMap.get(rowKey) ?? {
      category: displayCategory,
      canonicalCategory:
        !isMacro && !labelsEquivalent(displayCategory, canonical)
          ? canonical
          : undefined,
      parent,
      bankRaw,
      isMacro,
      rates: {},
    }
    const hadProviders = Object.keys(existing.rates).length > 0
    existing.rates[provider.key] = item.rate
    if (!existing.parent && parent) existing.parent = parent
    if (!existing.isMacro && isMacro) existing.isMacro = isMacro

    if (!isMacro && hadProviders && existing.canonicalCategory) {
      existing.category = formatCategoryLabel(existing.canonicalCategory)
      existing.bankRaw = undefined
    } else if (!hadProviders) {
      existing.category = displayCategory
      if (!isMacro && !labelsEquivalent(displayCategory, canonical)) {
        existing.canonicalCategory = canonical
      }
      if (bankRaw) existing.bankRaw = bankRaw
    } else if (hadProviders && isMacro) {
      existing.bankRaw = undefined
    }

    rowMap.set(rowKey, existing)
  }

  const providers =
    matrix && matrix.kind === kind
      ? [...matrix.providers.filter((p) => p.key !== provider.key), provider]
      : [provider]

  return {
    kind,
    providers,
    rows: Array.from(rowMap.values()).sort((a, b) =>
      a.category.localeCompare(b.category, "ru"),
    ),
  }
}

export function mergeSubmissionsIntoMatrix(
  bankItems: { provider: MatrixProvider; items: MappedItem[] }[],
  marketItems: { provider: MatrixProvider; items: MappedItem[] }[],
): { bank: CashbackMatrix | null; market: CashbackMatrix | null } {
  let bankMatrix: CashbackMatrix | null = null
  let marketMatrix: CashbackMatrix | null = null

  for (const entry of bankItems) {
    bankMatrix = mergeMappedItems(bankMatrix, entry.provider, entry.items, "bank")
  }

  for (const entry of marketItems) {
    marketMatrix = mergeMappedItems(marketMatrix, entry.provider, entry.items, "market")
  }

  return { bank: bankMatrix, market: marketMatrix }
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

/** Parent row is flat; subcategories expand on chevron click. */
export function groupHasSubcategories(group: MatrixGroup): boolean {
  return !isMacroOnlyGroup(group)
}

/** Macro rows mapped to L1 but with a narrower OCR label (e.g. «Мясо») stay visible as children. */
function visibleMacroChildren(parent: string, macroRows: MatrixRow[]): MatrixRow[] {
  return macroRows.filter((row) => {
    const ocrLabel = row.marketRaw?.trim()
    if (ocrLabel && !labelsEquivalent(ocrLabel, parent)) return true
    return !labelsEquivalent(row.category, parent)
  })
}

export function groupMatrixRows(rows: MatrixRow[]): MatrixGroup[] {
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

export function findMatchingProvider(
  submission: SourceSubmission,
  providers: MatrixProvider[],
): MatrixProvider | undefined {
  return providers.find((provider) =>
    providerNamesMatch(submission.providerName, provider.name, submission.kind),
  )
}

export function createProviderFromSubmission(
  submission: SourceSubmission,
  existingKeys: Set<string>,
  existingProviders: MatrixProvider[] = [],
): MatrixProvider {
  const existing = findMatchingProvider(submission, existingProviders)
  if (existing) return existing

  const name = submission.providerName.trim()
  const key = buildProviderKey(name, existingKeys)
  const logo = submission.providerSlug
    ? getProviderLogoBySlug(submission.providerSlug, submission.kind)
    : resolveProviderLogo(name, submission.kind)

  return {
    key,
    name,
    logo,
  }
}