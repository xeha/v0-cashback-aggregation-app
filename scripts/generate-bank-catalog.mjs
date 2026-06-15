import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const readmePath =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/rblp/README.md"
const outPath = join(root, "lib/data/bank-catalog.json")

const readme = readFileSync(readmePath, "utf8")
const rowRe = /\|\s*<img[^>]+>\s*\|\s*([^|]+?)\s*\|\s*([a-z0-9-]+)\s*\|/gi
const entries = []
const seen = new Set()
let match

while ((match = rowRe.exec(readme)) !== null) {
  const name = match[1].trim()
  const slug = match[2].trim()
  if (seen.has(slug)) continue
  seen.add(slug)
  entries.push({ slug, name })
}

entries.sort((a, b) => a.name.localeCompare(b.name, "ru"))
mkdirSync(join(root, "lib/data"), { recursive: true })
writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n")
console.log(`Wrote ${entries.length} bank catalog entries`)
