import { describe, expect, it } from "vitest"
import { canProceedBankSelect, isBankSelectRowComplete } from "@/lib/bank-select-rows"

describe("isBankSelectRowComplete", () => {
  it("requires both name and screenshot", () => {
    expect(isBankSelectRowComplete("Сбер", "data:image/png;base64,abc")).toBe(true)
    expect(isBankSelectRowComplete("", "data:image/png;base64,abc")).toBe(false)
    expect(isBankSelectRowComplete("Сбер", "")).toBe(false)
  })
})

describe("canProceedBankSelect", () => {
  it("allows proceed when locked rows are complete and new row is empty", () => {
    expect(
      canProceedBankSelect(
        ["Магнит", "Яндекс Пэй", ""],
        ["shot-1", "shot-2", "shot-3"],
      ),
    ).toBe(true)
  })

  it("blocks proceed when no row is complete", () => {
    expect(canProceedBankSelect([""], ["shot-1"])).toBe(false)
  })
})
