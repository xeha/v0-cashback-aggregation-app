import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function normalize(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildCatalog(entries, basePath) {
  return entries.map(({ slug, name }) => ({
    slug,
    names: [name],
    logo: `${basePath}/${slug}.png`,
  }))
}

function findCatalogMatch(name, kind, bankCatalog, marketCatalog, aliases) {
  const normalized = normalize(name)
  if (!normalized) return null

  const catalog = kind === "market" ? marketCatalog : bankCatalog
  const kindAliases = aliases[kind] ?? {}

  const aliasSlug = kindAliases[normalized]
  if (aliasSlug) {
    const aliasHit = catalog.find((e) => e.slug === aliasSlug)
    if (aliasHit) return aliasHit
  }

  const exactNameHit = catalog.find((entry) =>
    entry.names.some((entryName) => normalize(entryName) === normalized),
  )
  if (exactNameHit) return exactNameHit

  const slugHit = catalog.find((e) => normalize(e.slug) === normalized)
  if (slugHit) return slugHit

  return null
}

function resolveProviderLogo(name, kind, bankCatalog, marketCatalog, aliases) {
  return findCatalogMatch(name, kind, bankCatalog, marketCatalog, aliases)?.logo ?? "/placeholder.svg"
}

const banks = JSON.parse(readFileSync(join(root, "lib/data/bank-catalog.json"), "utf8"))
const markets = JSON.parse(readFileSync(join(root, "lib/data/market-retailers.json"), "utf8"))
const aliases = JSON.parse(readFileSync(join(root, "lib/data/logo-aliases.json"), "utf8"))

const bankCatalog = buildCatalog(banks, "/logos/banks")
const marketCatalog = markets.map((r) => ({
  slug: r.slug,
  names: [r.name],
  logo: `/logos/markets/${r.slug}.png`,
}))

assert.equal(
  resolveProviderLogo("Сбер", "bank", bankCatalog, marketCatalog, aliases),
  "/logos/banks/sberbank.png",
)
assert.equal(
  resolveProviderLogo("Пятёрочка", "market", bankCatalog, marketCatalog, aliases),
  "/logos/markets/5ka.png",
)
assert.equal(
  resolveProviderLogo("Метро", "market", bankCatalog, marketCatalog, aliases),
  "/logos/markets/metro-cc.png",
)
assert.equal(
  resolveProviderLogo("ВкусВилл", "market", bankCatalog, marketCatalog, aliases),
  "/logos/markets/vkusvill_offline.png",
)
assert.equal(
  resolveProviderLogo("Неизвестный Магазин XYZ", "market", bankCatalog, marketCatalog, aliases),
  "/placeholder.svg",
)
assert.equal(
  resolveProviderLogo("Т-Банк", "bank", bankCatalog, marketCatalog, aliases),
  "/logos/banks/tbank.png",
)
assert.equal(
  resolveProviderLogo("Банк", "bank", bankCatalog, marketCatalog, aliases),
  "/placeholder.svg",
)
assert.equal(
  resolveProviderLogo("Мой особенный банк", "bank", bankCatalog, marketCatalog, aliases),
  "/placeholder.svg",
)

console.log("verify-provider-logos: all assertions passed")
