export type BankKey = "alfa" | "psb" | "yandex" | "tbank"

export interface Bank {
  key: BankKey
  name: string
  logo: string
}

export const BANKS: Bank[] = [
  { key: "alfa", name: "Альфа-Банк", logo: "/logos/alfabank.png" },
  { key: "psb", name: "ПСБ", logo: "/logos/psbank.png" },
  { key: "yandex", name: "Яндекс Банк", logo: "/logos/yandex.png" },
  { key: "tbank", name: "Т-Банк", logo: "/logos/tbank.png" },
]

export interface CashbackRow {
  category: string
  rates: Partial<Record<BankKey, number>>
}

export const CASHBACK_ROWS: CashbackRow[] = [
  { category: "Кафе, бары, рестораны", rates: { alfa: 5, psb: 7 } },
  { category: "Аптеки", rates: { alfa: 5, yandex: 5 } },
  { category: "Одежда и обувь", rates: { alfa: 5, tbank: 3 } },
  { category: "Фастфуд", rates: { alfa: 7, yandex: 5, tbank: 5 } },
  { category: "Товары для детей", rates: { alfa: 9, yandex: 3, tbank: 3 } },
]

export const TOP_BANKS = [
  "Сбербанк",
  "Т-Банк",
  "Альфа-Банк",
  "ВТБ",
  "Газпромбанк",
  "Райффайзен",
  "ПСБ",
  "Яндекс Банк",
]

export type RateTier = "high" | "mid" | "low"

/**
 * Returns a per-row map of bankKey -> tier ("high" | "mid" | "low").
 * Tiers are computed against the distinct rate values present in the row.
 * Equal values share the highest available tier among them.
 */
export function getRowTiers(rates: CashbackRow["rates"]): Record<string, RateTier> {
  const entries = Object.entries(rates) as [BankKey, number][]
  const distinct = Array.from(new Set(entries.map(([, v]) => v))).sort((a, b) => b - a)

  const valueToTier = new Map<number, RateTier>()
  if (distinct.length === 1) {
    valueToTier.set(distinct[0], "high")
  } else if (distinct.length === 2) {
    valueToTier.set(distinct[0], "high")
    valueToTier.set(distinct[1], "low")
  } else {
    valueToTier.set(distinct[0], "high")
    valueToTier.set(distinct[distinct.length - 1], "low")
    for (let i = 1; i < distinct.length - 1; i++) {
      valueToTier.set(distinct[i], "mid")
    }
  }

  const result: Record<string, RateTier> = {}
  for (const [key, value] of entries) {
    result[key] = valueToTier.get(value)!
  }
  return result
}

export function getCurrentMonthYear(): string {
  const months = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ]
  const now = new Date()
  return `${months[now.getMonth()]} ${now.getFullYear()}`
}
