import type { CashbackPeriod } from "@/lib/types"

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const

export function getDefaultCashbackPeriod(now = new Date()): CashbackPeriod {
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export function formatCashbackPeriod(period: CashbackPeriod): string {
  const name = MONTH_NAMES[period.month - 1]
  return name ? `${name} ${period.year}` : `${period.month}.${period.year}`
}

export function formatFileModifiedDate(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}.${date.getFullYear()}`
}

export function periodToOptionValue(period: CashbackPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`
}

export function optionValueToPeriod(value: string): CashbackPeriod | null {
  const match = value.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { month, year }
}

export function getCashbackPeriodOptions(
  monthsBack = 11,
  now = new Date(),
): { value: string; label: string; period: CashbackPeriod }[] {
  const options: { value: string; label: string; period: CashbackPeriod }[] = []
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1)

  for (let i = 0; i <= monthsBack; i += 1) {
    const period = { month: cursor.getMonth() + 1, year: cursor.getFullYear() }
    options.push({
      value: periodToOptionValue(period),
      label: formatCashbackPeriod(period),
      period,
    })
    cursor.setMonth(cursor.getMonth() - 1)
  }

  return options
}

export function cashbackPeriodFromSaved(
  periodMonth?: number,
  periodYear?: number,
  fallback = getDefaultCashbackPeriod(),
): CashbackPeriod {
  if (periodMonth && periodMonth >= 1 && periodMonth <= 12 && periodYear) {
    return { month: periodMonth, year: periodYear }
  }
  return fallback
}
