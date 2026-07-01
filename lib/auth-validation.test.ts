import { describe, it, expect } from "vitest"
import {
  validateEmailFormat,
  validatePasswordStrength,
  validateRegisterInput,
  validateLoginInput,
} from "@/lib/auth-validation"

const VALID_PASSWORD = "SecurePass1!"

describe("validateEmailFormat", () => {
  it("normalizes email to lowercase", () => {
    const result = validateEmailFormat("  User@Example.COM  ")
    expect(result).toEqual({ ok: true, email: "user@example.com" })
  })

  it("rejects invalid format", () => {
    const result = validateEmailFormat("not-an-email")
    expect(result.ok).toBe(false)
  })

  it("rejects disposable domains", () => {
    const result = validateEmailFormat("user@mailinator.com")
    expect(result).toMatchObject({
      ok: false,
      message: "Временные email-адреса не поддерживаются",
    })
  })

  it("rejects role-based emails", () => {
    const result = validateEmailFormat("admin@company.com")
    expect(result).toMatchObject({ ok: false })
  })

  it("allows plus addressing", () => {
    const result = validateEmailFormat("user+tag@example.com")
    expect(result).toEqual({ ok: true, email: "user+tag@example.com" })
  })
})

describe("validatePasswordStrength", () => {
  it("accepts strong password", () => {
    expect(validatePasswordStrength(VALID_PASSWORD)).toEqual({ ok: true })
  })

  it("rejects short password", () => {
    const result = validatePasswordStrength("Ab1!")
    expect(result.ok).toBe(false)
  })

  it("requires uppercase", () => {
    const result = validatePasswordStrength("lowercase1!")
    expect(result.message).toContain("заглавную")
  })

  it("requires digit", () => {
    const result = validatePasswordStrength("NoDigits!!")
    expect(result.message).toContain("цифру")
  })

  it("requires special character", () => {
    const result = validatePasswordStrength("NoSpecial1")
    expect(result.message).toContain("спецсимвол")
  })

  it("rejects common passwords", () => {
    const result = validatePasswordStrength("Password1")
    expect(result.ok).toBe(false)
  })

  it("rejects password containing email local part", () => {
    const result = validatePasswordStrength("Myjohn1!secret", "john@example.com")
    expect(result.ok).toBe(false)
  })
})

describe("validateRegisterInput", () => {
  it("returns normalized email on success", () => {
    const result = validateRegisterInput("user@example.com", VALID_PASSWORD, VALID_PASSWORD)
    expect(result).toEqual({ ok: true, email: "user@example.com" })
  })

  it("rejects mismatched passwords", () => {
    const result = validateRegisterInput("user@example.com", VALID_PASSWORD, "OtherPass1!")
    expect(result).toEqual({ ok: false, message: "Пароли не совпадают", field: "passwordConfirm" })
  })
})

describe("validateLoginInput", () => {
  it("requires password", () => {
    const result = validateLoginInput("user@example.com", "")
    expect(result).toEqual({ ok: false, message: "Введите пароль", field: "password" })
  })
})
