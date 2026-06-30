import { describe, expect, it } from "vitest"
import {
  cashbackPeriodFromSaved,
  formatCashbackPeriod,
  formatFileModifiedDate,
  getCashbackPeriodOptions,
  getDefaultCashbackPeriod,
  optionValueToPeriod,
  periodToOptionValue,
} from "@/lib/cashback-period"

describe("getDefaultCashbackPeriod", () => {
  it("returns current month and year", () => {
    const now = new Date("2026-06-15T10:00:00")
    expect(getDefaultCashbackPeriod(now)).toEqual({ month: 6, year: 2026 })
  })

  it("handles January", () => {
    const now = new Date("2026-01-01T00:00:00")
    expect(getDefaultCashbackPeriod(now)).toEqual({ month: 1, year: 2026 })
  })
})

describe("formatCashbackPeriod", () => {
  it("formats with Russian month name", () => {
    expect(formatCashbackPeriod({ month: 6, year: 2026 })).toBe("Июнь 2026")
  })

  it("falls back to numeric format for invalid month", () => {
    expect(formatCashbackPeriod({ month: 13, year: 2026 })).toBe("13.2026")
  })
})

describe("formatFileModifiedDate", () => {
  it("formats valid timestamp as DD.MM.YYYY", () => {
    const ms = new Date("2026-03-05T14:30:00").getTime()
    expect(formatFileModifiedDate(ms)).toBe("05.03.2026")
  })

  it("returns null for zero", () => {
    expect(formatFileModifiedDate(0)).toBeNull()
  })

  it("returns null for negative", () => {
    expect(formatFileModifiedDate(-1)).toBeNull()
  })

  it("returns null for NaN", () => {
    expect(formatFileModifiedDate(Number.NaN)).toBeNull()
  })

  it("returns null for Infinity", () => {
    expect(formatFileModifiedDate(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe("periodToOptionValue", () => {
  it("pads month to two digits", () => {
    expect(periodToOptionValue({ month: 3, year: 2026 })).toBe("2026-03")
  })

  it("keeps double-digit month", () => {
    expect(periodToOptionValue({ month: 12, year: 2025 })).toBe("2025-12")
  })
})

describe("optionValueToPeriod", () => {
  it("parses valid option value", () => {
    expect(optionValueToPeriod("2026-06")).toEqual({ month: 6, year: 2026 })
  })

  it("returns null for invalid format", () => {
    expect(optionValueToPeriod("2026/06")).toBeNull()
    expect(optionValueToPeriod("")).toBeNull()
  })

  it("returns null for month out of range", () => {
    expect(optionValueToPeriod("2026-00")).toBeNull()
    expect(optionValueToPeriod("2026-13")).toBeNull()
  })
})

describe("getCashbackPeriodOptions", () => {
  const now = new Date("2026-06-15T10:00:00")

  it("returns 12 months including current, newest first", () => {
    const options = getCashbackPeriodOptions(11, now)
    expect(options).toHaveLength(12)
    expect(options[0]).toEqual({
      value: "2026-06",
      label: "Июнь 2026",
      period: { month: 6, year: 2026 },
    })
    expect(options[11]).toEqual({
      value: "2025-07",
      label: "Июль 2025",
      period: { month: 7, year: 2025 },
    })
  })

  it("crosses year boundary", () => {
    const janNow = new Date("2026-01-10T00:00:00")
    const options = getCashbackPeriodOptions(11, janNow)
    expect(options[0].period).toEqual({ month: 1, year: 2026 })
    expect(options[1].period).toEqual({ month: 12, year: 2025 })
  })
})

describe("cashbackPeriodFromSaved", () => {
  const fallback = { month: 6, year: 2026 }

  it("returns saved period when valid", () => {
    expect(cashbackPeriodFromSaved(3, 2025, fallback)).toEqual({ month: 3, year: 2025 })
  })

  it("returns fallback when month missing", () => {
    expect(cashbackPeriodFromSaved(undefined, 2025, fallback)).toEqual(fallback)
  })

  it("returns fallback when year missing", () => {
    expect(cashbackPeriodFromSaved(3, undefined, fallback)).toEqual(fallback)
  })

  it("returns fallback when month out of range", () => {
    expect(cashbackPeriodFromSaved(0, 2025, fallback)).toEqual(fallback)
    expect(cashbackPeriodFromSaved(13, 2025, fallback)).toEqual(fallback)
  })
})
