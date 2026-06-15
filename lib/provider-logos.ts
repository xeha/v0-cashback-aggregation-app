import bankCatalogData from "@/lib/data/bank-catalog.json"
import marketRetailersData from "@/lib/data/market-retailers.json"
import logoAliasesData from "@/lib/data/logo-aliases.json"
import type { Kind } from "@/lib/types"

export const PROVIDER_LOGO_PLACEHOLDER = "/placeholder.svg"

export interface LogoEntry {
  slug: string
  names: string[]
  logo: string
}

export interface ProviderSuggestion {
  slug: string
  name: string
  logo: string
}

interface CatalogRecord {
  slug: string
  name: string
  alsoKnownAs?: string[]
}

interface MarketRecord {
  slug: string
  name: string
}

interface LogoAliasesFile {
  bank: Record<string, string>
  market: Record<string, string>
}

const logoAliases = logoAliasesData as LogoAliasesFile

function buildCatalog(entries: CatalogRecord[], basePath: string): LogoEntry[] {
  return entries.map(({ slug, name, alsoKnownAs }) => ({
    slug,
    names: [name, ...(alsoKnownAs ?? [])],
    logo: `${basePath}/${slug}.png`,
  }))
}

const bankCatalog: LogoEntry[] = buildCatalog(
  bankCatalogData as CatalogRecord[],
  "/logos/banks",
)

const marketCatalog: LogoEntry[] = (marketRetailersData as MarketRecord[]).map(
  ({ slug, name }) => ({
    slug,
    names: [name],
    logo: `/logos/markets/${slug}.png`,
  }),
)

function getCatalog(kind: Kind): LogoEntry[] {
  return kind === "market" ? marketCatalog : bankCatalog
}

function toSuggestion(entry: LogoEntry): ProviderSuggestion {
  return {
    slug: entry.slug,
    name: entry.names[0],
    logo: entry.logo,
  }
}

export function normalizeProviderName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Exact catalog match only: alias, canonical name, or slug. */
export function findCatalogMatch(name: string, kind: Kind): ProviderSuggestion | null {
  const normalized = normalizeProviderName(name)
  if (!normalized) return null

  const catalog = getCatalog(kind)
  const kindAliases = logoAliases[kind] ?? {}

  const aliasSlug = kindAliases[normalized]
  if (aliasSlug) {
    const aliasHit = catalog.find((entry) => entry.slug === aliasSlug)
    if (aliasHit) return toSuggestion(aliasHit)
  }

  const exactNameHit = catalog.find((entry) =>
    entry.names.some((entryName) => normalizeProviderName(entryName) === normalized),
  )
  if (exactNameHit) return toSuggestion(exactNameHit)

  const slugHit = catalog.find(
    (entry) => normalizeProviderName(entry.slug) === normalized,
  )
  if (slugHit) return toSuggestion(slugHit)

  return null
}

export function searchProviderSuggestions(
  query: string,
  kind: Kind,
  limit = 8,
): ProviderSuggestion[] {
  const normalized = normalizeProviderName(query)
  if (!normalized) return []

  const catalog = getCatalog(kind)
  const scored = catalog
    .map((entry) => {
      const name = entry.names[0]
      const nameNorm = normalizeProviderName(name)
      const slugNorm = normalizeProviderName(entry.slug)

      let score = -1
      if (nameNorm.startsWith(normalized)) score = 0
      else if (nameNorm.includes(normalized)) score = 1
      else if (slugNorm.includes(normalized)) score = 2
      else if (normalized.split(" ").every((word) => nameNorm.includes(word))) score = 3

      return score >= 0 ? { entry, score, nameLen: nameNorm.length } : null
    })
    .filter((item): item is { entry: LogoEntry; score: number; nameLen: number } => item !== null)

  scored.sort((a, b) => a.score - b.score || a.nameLen - b.nameLen || a.entry.names[0].localeCompare(b.entry.names[0], "ru"))

  const seen = new Set<string>()
  const results: ProviderSuggestion[] = []
  for (const { entry } of scored) {
    if (seen.has(entry.slug)) continue
    seen.add(entry.slug)
    results.push(toSuggestion(entry))
    if (results.length >= limit) break
  }

  return results
}

export function getProviderLogoBySlug(slug: string, kind: Kind): string {
  const hit = getCatalog(kind).find((entry) => entry.slug === slug)
  return hit?.logo ?? PROVIDER_LOGO_PLACEHOLDER
}

export function resolveProviderLogo(name: string, kind: Kind): string {
  return findCatalogMatch(name, kind)?.logo ?? PROVIDER_LOGO_PLACEHOLDER
}

export function getMarketAutocompleteNames(): string[] {
  return (marketRetailersData as MarketRecord[])
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, "ru"))
}
