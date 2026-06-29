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
  kind: Kind
}

export interface CatalogMatchResult {
  bank: ProviderSuggestion | null
  market: ProviderSuggestion | null
}

interface CatalogRecord {
  slug: string
  name: string
  alsoKnownAs?: string[]
}

interface MarketRecord {
  slug: string
  name: string
  alsoKnownAs?: string[]
}

interface LogoAliasesFile {
  bank: Record<string, string>
  market: Record<string, string>
}

const logoAliases = logoAliasesData as LogoAliasesFile

/** Timeweb CDN → S3 — единственный источник логотипов (без public/logos). */
const DEFAULT_ASSETS_URL = "https://1mh89t7nqb.cdn.twcstorage.ru"

export function getAssetsBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ASSETS_URL?.trim() : ""
  return (fromEnv || DEFAULT_ASSETS_URL).replace(/\/$/, "")
}

function resolveLogoBasePath(folder: "banks" | "markets"): string {
  return `${getAssetsBaseUrl()}/logos/${folder}`
}

function buildCatalog(entries: CatalogRecord[], folder: "banks" | "markets"): LogoEntry[] {
  const basePath = resolveLogoBasePath(folder)
  return entries.map(({ slug, name, alsoKnownAs }) => ({
    slug,
    names: [name, ...(alsoKnownAs ?? [])],
    logo: `${basePath}/${slug}.png`,
  }))
}

const bankCatalog: LogoEntry[] = buildCatalog(
  bankCatalogData as CatalogRecord[],
  "banks",
)

const marketCatalog: LogoEntry[] = buildCatalog(
  marketRetailersData as MarketRecord[],
  "markets",
)

function getCatalog(kind: Kind): LogoEntry[] {
  return kind === "market" ? marketCatalog : bankCatalog
}

function toSuggestion(entry: LogoEntry, kind: Kind): ProviderSuggestion {
  return {
    slug: entry.slug,
    name: entry.names[0],
    logo: entry.logo,
    kind,
  }
}

export function normalizeProviderName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/э/g, "е")
    .replace(/[^a-zа-я0-9\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Canonical key for comparing names across Latin/Cyrillic variants via catalog slug. */
export function getProviderComparisonKey(name: string, kind: Kind): string {
  const trimmed = name.trim()
  if (!trimmed) return ""

  const match = findCatalogMatchInCatalog(trimmed, kind)
  if (match) return `slug:${match.slug}`

  return `name:${normalizeProviderName(trimmed)}`
}

export function providerNamesMatch(a: string, b: string, kind: Kind): boolean {
  const keyA = getProviderComparisonKey(a, kind)
  const keyB = getProviderComparisonKey(b, kind)
  return Boolean(keyA && keyB && keyA === keyB)
}

export function isSameProviderIdentity(
  first: { name: string; kind: Kind },
  second: { name: string; kind: Kind },
): boolean {
  if (first.kind !== second.kind) return false
  return providerNamesMatch(first.name, second.name, first.kind)
}

function findCatalogMatchInCatalog(
  name: string,
  kind: Kind,
): ProviderSuggestion | null {
  const normalized = normalizeProviderName(name)
  if (!normalized) return null

  const catalog = getCatalog(kind)
  const kindAliases = logoAliases[kind] ?? {}

  const aliasSlug = kindAliases[normalized]
  if (aliasSlug) {
    const aliasHit = catalog.find((entry) => entry.slug === aliasSlug)
    if (aliasHit) return toSuggestion(aliasHit, kind)
  }

  const exactNameHit = catalog.find((entry) =>
    entry.names.some((entryName) => normalizeProviderName(entryName) === normalized),
  )
  if (exactNameHit) return toSuggestion(exactNameHit, kind)

  const slugHit = catalog.find(
    (entry) => normalizeProviderName(entry.slug) === normalized,
  )
  if (slugHit) return toSuggestion(slugHit, kind)

  return null
}

/** Exact catalog match only: alias, canonical name, or slug. */
export function findCatalogMatch(name: string, kind: Kind): ProviderSuggestion | null {
  return findCatalogMatchInCatalog(name, kind)
}

export function findCatalogMatches(name: string): CatalogMatchResult {
  return {
    bank: findCatalogMatchInCatalog(name, "bank"),
    market: findCatalogMatchInCatalog(name, "market"),
  }
}

function scoreNameMatch(nameNorm: string, slugNorm: string, normalized: string): number {
  if (nameNorm.startsWith(normalized)) return 0
  if (nameNorm.includes(normalized)) return 1
  if (slugNorm.includes(normalized)) return 2
  if (normalized.split(" ").every((word) => nameNorm.includes(word))) return 3
  return -1
}

function searchCatalogSuggestions(
  query: string,
  kind: Kind,
): { entry: LogoEntry; score: number; nameLen: number }[] {
  const normalized = normalizeProviderName(query)
  if (!normalized) return []

  const catalog = getCatalog(kind)
  const kindAliases = logoAliases[kind] ?? {}
  const scored = new Map<string, { entry: LogoEntry; score: number; nameLen: number }>()

  for (const entry of catalog) {
    const slugNorm = normalizeProviderName(entry.slug)
    let bestScore = -1
    let shortestNameLen = Number.POSITIVE_INFINITY

    for (const name of entry.names) {
      const nameNorm = normalizeProviderName(name)
      const score = scoreNameMatch(nameNorm, slugNorm, normalized)
      if (score >= 0) {
        bestScore = bestScore < 0 ? score : Math.min(bestScore, score)
        shortestNameLen = Math.min(shortestNameLen, nameNorm.length)
      }
    }

    if (bestScore >= 0) {
      scored.set(entry.slug, { entry, score: bestScore, nameLen: shortestNameLen })
    }
  }

  for (const [aliasKey, slug] of Object.entries(kindAliases)) {
    const aliasNorm = normalizeProviderName(aliasKey)
    const score = scoreNameMatch(aliasNorm, aliasNorm, normalized)
    if (score < 0) continue

    const entry = catalog.find((item) => item.slug === slug)
    if (!entry) continue

    const existing = scored.get(slug)
    if (!existing || score < existing.score) {
      scored.set(slug, {
        entry,
        score,
        nameLen: Math.min(existing?.nameLen ?? Number.POSITIVE_INFINITY, aliasNorm.length),
      })
    }
  }

  return [...scored.values()].sort(
    (a, b) =>
      a.score - b.score ||
      a.nameLen - b.nameLen ||
      a.entry.names[0].localeCompare(b.entry.names[0], "ru"),
  )
}

export function searchProviderSuggestions(
  query: string,
  kind: Kind,
  limit = 8,
): ProviderSuggestion[] {
  return searchCatalogSuggestions(query, kind)
    .slice(0, limit)
    .map(({ entry }) => toSuggestion(entry, kind))
}

export function searchAllProviderSuggestions(
  query: string,
  limit = 8,
): ProviderSuggestion[] {
  const bankHits = searchCatalogSuggestions(query, "bank").map((hit) => ({
    ...hit,
    kind: "bank" as const,
  }))
  const marketHits = searchCatalogSuggestions(query, "market").map((hit) => ({
    ...hit,
    kind: "market" as const,
  }))

  const merged = [...bankHits, ...marketHits].sort(
    (a, b) =>
      a.score - b.score ||
      a.nameLen - b.nameLen ||
      a.entry.names[0].localeCompare(b.entry.names[0], "ru"),
  )

  const results: ProviderSuggestion[] = []
  const seen = new Set<string>()

  for (const { entry, kind } of merged) {
    const key = `${kind}:${entry.slug}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(toSuggestion(entry, kind))
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
