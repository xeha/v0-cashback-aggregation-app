// @vitest-environment jsdom

import { createElement, type ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { makeClientResponseError } from "@/lib/test-utils/pocketbase-error"

const authWithPassword = vi.fn()
const create = vi.fn()
const authRefresh = vi.fn()
const requestVerification = vi.fn()
const requestPasswordReset = vi.fn()
const confirmPasswordReset = vi.fn()
const confirmVerification = vi.fn()
const clear = vi.fn()
const onChange = vi.fn()

vi.mock("@/lib/pocketbase", () => ({
  createPocketBase: () => ({
    authStore: {
      record: null,
      isValid: false,
      onChange,
      clear,
    },
    collection: () => ({
      authWithPassword,
      create,
      authRefresh,
      requestVerification,
      requestPasswordReset,
      confirmPasswordReset,
      confirmVerification,
    }),
  }),
}))

vi.mock("@/lib/auth-config", () => ({
  AUTH_REQUIRE_EMAIL_VERIFICATION: false,
}))

vi.mock("@/lib/auth-api", () => ({
  validateEmailMx: vi.fn().mockResolvedValue({
    valid: true,
    email: "user@example.com",
    domain: "example.com",
    mx: true,
  }),
}))

const VALID_PASSWORD = "SecurePass1!"

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AuthProvider, null, children)
}

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within AuthProvider",
    )
  })
})

describe("useAuth login", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls authWithPassword on success", async () => {
    authWithPassword.mockResolvedValue({})

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login("  user@example.com  ", VALID_PASSWORD)
    })

    expect(authWithPassword).toHaveBeenCalledWith("user@example.com", VALID_PASSWORD)
  })

  it("throws formatted PB error on failure", async () => {
    authWithPassword.mockRejectedValue(
      makeClientResponseError(400, { message: "Invalid login credentials." }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.login("user@example.com", "WrongPass99!")
      }),
    ).rejects.toThrow("Неверный email или пароль")
  })
})

describe("useAuth logout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("clears auth store", () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.logout()
    })

    expect(clear).toHaveBeenCalled()
  })
})

describe("useAuth register", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws validation error before hitting PB", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      result.current.register("a@b.com", "short", "short"),
    ).rejects.toThrow("Пароль должен быть не короче 8 символов")

    expect(create).not.toHaveBeenCalled()
  })

  it("creates user then logs in on success when verification off", async () => {
    create.mockResolvedValue({})
    authWithPassword.mockResolvedValue({})

    const { result } = renderHook(() => useAuth(), { wrapper })

    let registerResult: Awaited<ReturnType<typeof result.current.register>> | undefined
    await act(async () => {
      registerResult = await result.current.register(
        "user@example.com",
        VALID_PASSWORD,
        VALID_PASSWORD,
      )
    })

    expect(create).toHaveBeenCalledWith({
      email: "user@example.com",
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD,
    })
    expect(authWithPassword).toHaveBeenCalledWith("user@example.com", VALID_PASSWORD)
    expect(registerResult).toEqual({ status: "logged-in" })
  })

  it("throws formatted error when create fails", async () => {
    create.mockRejectedValue(
      makeClientResponseError(400, {
        email: { message: "Email already in use." },
      }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      result.current.register("user@example.com", VALID_PASSWORD, VALID_PASSWORD),
    ).rejects.toThrow("Этот email уже зарегистрирован")

    expect(authWithPassword).not.toHaveBeenCalled()
  })
})

describe("useAuth password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requests password reset with normalized email", async () => {
    requestPasswordReset.mockResolvedValue(true)
    const { result } = renderHook(() => useAuth(), { wrapper })

    let message = ""
    await act(async () => {
      message = await result.current.requestPasswordReset("  User@Example.com ")
    })

    expect(requestPasswordReset).toHaveBeenCalledWith("user@example.com")
    expect(message).toContain("Если email зарегистрирован")
  })

  it("confirms password reset and clears session", async () => {
    confirmPasswordReset.mockResolvedValue(true)
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.resetPassword("token-abc", VALID_PASSWORD, VALID_PASSWORD)
    })

    expect(confirmPasswordReset).toHaveBeenCalledWith("token-abc", VALID_PASSWORD, VALID_PASSWORD)
    expect(clear).toHaveBeenCalled()
  })
})
