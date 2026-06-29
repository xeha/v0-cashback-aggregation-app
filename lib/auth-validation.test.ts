import { describe, it, expect } from "vitest"
import { validateRegisterInput } from "@/lib/auth-validation"

describe("validateRegisterInput", () => {
  it("trims email on success", () => {
    const result = validateRegisterInput("  user@example.com  ", "password1", "password1")
    expect(result).toEqual({ ok: true, email: "user@example.com" })
  })

  it("rejects password shorter than 8 chars", () => {
    const result = validateRegisterInput("user@example.com", "short", "short")
    expect(result).toEqual({
      ok: false,
      message: "Пароль должен быть не короче 8 символов",
    })
  })

  it("rejects mismatched passwords", () => {
    const result = validateRegisterInput("user@example.com", "password1", "password2")
    expect(result).toEqual({ ok: false, message: "Пароли не совпадают" })
  })

  it("rejects empty email", () => {
    const result = validateRegisterInput("   ", "password1", "password1")
    expect(result).toEqual({ ok: false, message: "Введите email" })
  })
})
