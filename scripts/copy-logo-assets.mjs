import { cpSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const BANKS_PNG_DIR =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/banks_logos/png"
const RSLP_PNG_DIR =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/supermarket_logos/rslp_pack/png"
const RSLP_JSON =
  "/Users/kseniya_agrova/Yandex.Disk.localized/obsidian/VIBECODING_Чуйков/supermarket_logos/rslp_pack/retailers.json"

const banksDir = join(root, "public/logos/banks")
const marketsDir = join(root, "public/logos/markets")
const dataDir = join(root, "lib/data")

mkdirSync(banksDir, { recursive: true })
mkdirSync(marketsDir, { recursive: true })
mkdirSync(dataDir, { recursive: true })

for (const file of readdirSync(banksDir)) {
  if (file.endsWith(".png")) rmSync(join(banksDir, file))
}

for (const file of readdirSync(BANKS_PNG_DIR)) {
  if (file.endsWith(".png")) {
    cpSync(join(BANKS_PNG_DIR, file), join(banksDir, file))
  }
}

for (const file of readdirSync(RSLP_PNG_DIR)) {
  if (file.endsWith(".png")) {
    cpSync(join(RSLP_PNG_DIR, file), join(marketsDir, file))
  }
}

copyFileSync(RSLP_JSON, join(dataDir, "market-retailers.json"))

const bankCount = readdirSync(banksDir).filter((f) => f.endsWith(".png")).length
const marketCount = readdirSync(marketsDir).filter((f) => f.endsWith(".png")).length
console.log(`Copied ${bankCount} bank logos, ${marketCount} market logos`)
console.log("Copied market-retailers.json")
