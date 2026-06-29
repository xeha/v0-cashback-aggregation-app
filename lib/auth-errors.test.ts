import { describe, it, expect } from "vitest"
import { formatAuthError } from "@/lib/auth-errors"
import { makeClientResponseError } from "@/lib/test-utils/pocketbase-error"

describe("formatAuthError", () => {
  it("returns PB message when present", () => {
    const error = makeClientResponseError(400, {
      message: "Invalid login credentials.",
    })
    expect(formatAuthError(error)).toBe("Invalid login credentials.")
  })

  it("maps 429 to Russian rate limit message", () => {
    const error = makeClientResponseError(429)
    expect(formatAuthError(error)).toBe("Слишком много попыток. Попробуйте позже")
  })

  it("maps 403 and 404", () => {
    expect(formatAuthError(makeClientResponseError(403))).toBe("Доступ запрещён")
    expect(formatAuthError(makeClientResponseError(404))).toBe("Сервис авторизации недоступен")
  })

  it("returns field email error", () => {
    const error = makeClientResponseError(400, {
      email: { message: "Некорректный email." },
    })
    expect(formatAuthError(error)).toBe("Некорректный email.")
  })

  it("returns field password error", () => {
    const error = makeClientResponseError(400, {
      password: { message: "Слишком короткий пароль." },
    })
    expect(formatAuthError(error)).toBe("Слишком короткий пароль.")
  })

  it("does not leak enumeration for generic 400", () => {
    const error = makeClientResponseError(400)
    expect(formatAuthError(error)).toBe("Проверьте введённые данные")
  })

  it("wraps native Error", () => {
    expect(formatAuthError(new Error("Пароли не совпадают"))).toBe("Пароли не совпадают")
  })

  it("fallback for unknown values", () => {
    expect(formatAuthError(null)).toBe("Произошла ошибка. Попробуйте снова")
  })
})
