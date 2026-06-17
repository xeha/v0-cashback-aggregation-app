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

function resolveRowKey(
  isMacro: boolean,
  parent: string | undefined,
  canonicalLabel: string,
): string {
  if (isMacro && parent) {
    return `macro::${normalizeCategoryLabel(parent)}`
  }
  return `leaf::${normalizeCategoryLabel(canonicalLabel)}`
}

function rowKeyFromExisting(row: MatrixRow): string {
  if (row.isMacro && row.parent) {
    return `macro::${normalizeCategoryLabel(row.parent)}`
  }
  return `leaf::${normalizeCategoryLabel(row.category)}`
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
      const key = rowKeyFromExisting(row)
      rowMap.set(key, {
        ...row,
        rates: { ...row.rates },
      })
    }
  }

  for (const item of items) {
    if (item.is_bank_offer) continue

    const isMacro = item.is_macro_category ?? false
    const parent = item.unified_parent
    const subcategory = item.unified_subcategory ?? item.unified_category
    const unifiedLabel = isMacro && parent ? parent : subcategory
    const displayCategory = formatCategoryLabel(unifiedLabel)
    const raw = item.raw_category.trim()
    const bankRaw =
      raw && !labelsEquivalent(raw, unifiedLabel) ? raw : undefined
    const rowKey = resolveRowKey(isMacro, parent, subcategory)

    const existing = rowMap.get(rowKey) ?? {
      category: displayCategory,
      parent,
      bankRaw,
      isMacro,
      rates: {},
    }
    const hadProviders = Object.keys(existing.rates).length > 0
    existing.rates[provider.key] = item.rate
    if (!existing.parent && parent) existing.parent = parent
    if (!existing.isMacro && isMacro) existing.isMacro = isMacro
    if (!hadProviders && bankRaw) existing.bankRaw = bankRaw
    if (hadProviders && isMacro) existing.bankRaw = undefined
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