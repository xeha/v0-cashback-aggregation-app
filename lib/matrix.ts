import { getProviderLogoBySlug, normalizeProviderName, resolveProviderLogo } from "@/lib/provider-logos"
import type {
  CashbackMatrix,
  Kind,
  MappedItem,
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
    const existing = rowMap.get(item.unified_category) ?? {
      category: item.unified_category,
      rates: {},
    }
    existing.rates[provider.key] = item.rate
    rowMap.set(item.unified_category, existing)
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

export function findMatchingProvider(
  submission: SourceSubmission,
  providers: MatrixProvider[],
): MatrixProvider | undefined {
  const normalizedName = normalizeProviderName(submission.providerName)
  if (!normalizedName) return undefined

  return providers.find(
    (provider) => normalizeProviderName(provider.name) === normalizedName,
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