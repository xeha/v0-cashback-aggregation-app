import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const banksJsonPath =
  process.env.BANKS_SOURCE_JSON ??
  process.argv[2] ??
  (() => { throw new Error("Provide BANKS_SOURCE_JSON env or path as first argument") })()
const overridesPath = join(root, "lib/data/bank-display-overrides.json")
const outPath = join(root, "lib/data/bank-catalog.json")

const banks = JSON.parse(readFileSync(banksJsonPath, "utf8"))
const overrides = JSON.parse(readFileSync(overridesPath, "utf8"))

const entries = banks.map(({ slug, name }) => {
  const override = overrides[slug]
  if (!override) return { slug, name }

  const entry = { slug, name: override.name ?? name }
  if (override.alsoKnownAs?.length) entry.alsoKnownAs = override.alsoKnownAs
  return entry
})

entries.sort((a, b) => a.name.localeCompare(b.name, "ru"))
mkdirSync(join(root, "lib/data"), { recursive: true })
writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n")
console.log(`Wrote ${entries.length} bank catalog entries`)
