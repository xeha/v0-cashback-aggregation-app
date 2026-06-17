/**
 * Unit checks for bank-service exclusion patterns (mirrors ocr_service.filter_bank_services).
 * Run: node scripts/verify-bank-service-filter.mjs
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const patterns = JSON.parse(
  readFileSync(join(__dirname, "../backend/data/bank_service_exclusions.json"), "utf8"),
)

function normalize(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
}

function isBankService(raw) {
  const normalized = normalize(raw)
  if (!normalized) return true
  return patterns.some((pattern) => normalized.includes(pattern))
}

const cases = [
  ["Кафе и рестораны", false],
  ["Одежда и обувь", false],
  ["Активный отдых", false],
  ["Детский мир", false],
  ["Молоко", false],
  ["Отели в Тревел", true],
  ["Авиа в Тревел", true],
  ["Альфа-Заправки", true],
  ["Альфа-Афиша", true],
  ["Шопинг в Городе", true],
  ["Мегамаркет", true],
  ["СберТревел", true],
]

let failed = 0
for (const [raw, expectService] of cases) {
  const got = isBankService(raw)
  if (got !== expectService) {
    console.error(`FAIL ${raw}: expected service=${expectService}, got ${got}`)
    failed += 1
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}

console.log("verify-bank-service-filter: ok")
