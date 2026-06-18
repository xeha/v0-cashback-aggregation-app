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
    return `ref::${row.referenceNodeId}::${row.referenceDepth}`
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

function resolveMarketRowKey(item: MappedItem, displayLabel: string): string {
  const nodeId = item.reference_node_id?.trim()
  const depth = getReferenceDepth(item)
  if (nodeId) {
    return `ref::${nodeId}::${depth}`
  }
  // Fallback for legacy/partial payloads while keeping key stable.
  return `ref::unknown::${depth}::${normalizeCategoryLabel(displayLabel)}`
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
      const displayLabel = formatCategoryLabel(item.display_label ?? item.unified_category)
      const rowKey = resolveMarketRowKey(item, displayLabel)
      const referenceDepth = getReferenceDepth(item)
      const referenceDepartment = item.reference_department ?? item.unified_parent
      const existing = rowMap.get(rowKey) ?? {
        category: displayLabel,
        parent: referenceDepartment,
        isMacro: referenceDepth === 1,
        referenceNodeId: item.reference_node_id,
        referenceDepartment,
        referenceCategory: item.reference_category,
        referenceSubcategory: item.reference_subcategory,
        referenceDepth,
        rates: {},
      }

      existing.rates[provider.key] = item.rate
      if (!existing.parent && referenceDepartment) existing.parent = referenceDepartment
      if (!existing.referenceDepartment && referenceDepartment) {
        existing.referenceDepartment = referenceDepartment
      }
      if (!existing.referenceCategory && item.reference_category) {
        existing.referenceCategory = item.reference_category
      }
      if (!existing.referenceSubcategory && item.reference_subcategory) {
        existing.referenceSubcategory = item.reference_subcategory
      }
      if (!existing.referenceNodeId && item.reference_node_id) {
        existing.referenceNodeId = item.reference_node_id
      }
      if (existing.referenceDepth === undefined) {
        existing.referenceDepth = referenceDepth
      }
      existing.isMacro = (existing.referenceDepth ?? referenceDepth) === 1
      existing.category = displayLabel

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
      const summarySource = macroRows.length > 0 ? macroRows : childRows

      for (const row of summarySource) {
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

      return {
        parent,
        summaryRates,
        rows: sortedChildren,
        isMacroOnly: sortedChildren.length === 0,
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