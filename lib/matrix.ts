import {
  getProviderLogoBySlug,
  providerNamesMatch,
  resolveProviderLogo,
} from "@/lib/provider-logos"
import {
  formatCategoryLabel,
  labelsEquivalent,
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

export function mergeMappedItems(
  matrix: CashbackMatrix | null,
  provider: MatrixProvider,
  items: MappedItem[],
  kind: Kind,
): CashbackMatrix {
  const rowMap = new Map<string, MatrixRow>()

  if (matrix && matrix.kind === kind) {
    for (const row of matrix.rows) {
      rowMap.set(row.category, { category: row.category, rates: { ...row.rates } })
    }
  }

  for (const item of items) {
    if (item.is_bank_offer) continue

    const isMacro = item.is_macro_category ?? false
    const parent = item.unified_parent
    const subcategory = item.unified_subcategory ?? item.unified_category
    const displayCategory = isMacro
      ? formatCategoryLabel(item.raw_category.trim() || subcategory)
      : subcategory
    const rowKey = isMacro && parent ? `${parent}::${displayCategory}` : subcategory

    const existing = rowMap.get(rowKey) ?? {
      category: displayCategory,
      parent,
      bankRaw: isMacro ? undefined : item.raw_category,
      isMacro,
      rates: {},
    }
    existing.rates[provider.key] = item.rate
    if (!existing.parent && parent) existing.parent = parent
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
  if (group.rows.length !== 1) return false
  const row = group.rows[0]
  if (row.isMacro) return true
  if (row.parent && labelsEquivalent(row.category, row.parent)) return true
  if (row.parent && row.bankRaw && labelsEquivalent(row.bankRaw, row.parent)) return true
  return false
}

/** Parent row is flat; subcategories expand on chevron click. */
export function groupHasSubcategories(group: MatrixGroup): boolean {
  return !isMacroOnlyGroup(group)
}

export function groupMatrixRows(rows: MatrixRow[]): MatrixGroup[] {
  const byParent = new Map<string, MatrixRow[]>()
  for (const row of rows) {
    const parent = row.parent ?? row.category
    const list = byParent.get(parent) ?? []
    list.push(row)
    byParent.set(parent, list)
  }
  return Array.from(byParent.entries()).map(([parent, children]) => {
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