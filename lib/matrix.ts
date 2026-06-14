import { BANKS, MARKETS } from "@/lib/cashback-data"
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

export function resolveProviderLogo(name: string, kind: Kind): string {
  const catalog = kind === "market" ? MARKETS : BANKS
  const normalized = name.toLowerCase().trim()

  const match = catalog.find((item) => {
    const itemName = item.name.toLowerCase()
    return (
      normalized.includes(itemName) ||
      itemName.includes(normalized) ||
      normalized.includes(item.key)
    )
  })

  return match?.logo ?? "/placeholder.svg"
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
      : matrix?.kind === kind
        ? [...matrix.providers, provider]
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

export function createProviderFromSubmission(
  submission: SourceSubmission,
  existingKeys: Set<string>,
): MatrixProvider {
  const key = buildProviderKey(submission.providerName, existingKeys)
  return {
    key,
    name: submission.providerName.trim(),
    logo: resolveProviderLogo(submission.providerName, submission.kind),
  }
}
