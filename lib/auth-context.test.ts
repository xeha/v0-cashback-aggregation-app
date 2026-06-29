// @vitest-environment jsdom

import { createElement, type ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { makeClientResponseError } from "@/lib/test-utils/pocketbase-error"

const authWithPassword = vi.fn()
const create = vi.fn()
const authRefresh = vi.fn()
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
    }),
  }),
}))

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
      await result.current.login("  user@example.com  ", "password1")
    })

    expect(authWithPassword).toHaveBeenCalledWith("user@example.com", "password1")
  })

  it("throws formatted PB error on failure", async () => {
    authWithPassword.mockRejectedValue(
      makeClientResponseError(400, { message: "Invalid login credentials." }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.login("user@example.com", "wrong")
      }),
    ).rejects.toThrow("Invalid login credentials.")
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

  it("creates user then logs in on success", async () => {
    create.mockResolvedValue({})
    authWithPassword.mockResolvedValue({})

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.register("user@example.com", "password1", "password1")
    })

    expect(create).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password1",
      passwordConfirm: "password1",
    })
    expect(authWithPassword).toHaveBeenCalledWith("user@example.com", "password1")
  })

  it("throws formatted error when create fails", async () => {
    create.mockRejectedValue(
      makeClientResponseError(400, {
        email: { message: "Email already in use." },
      }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      result.current.register("user@example.com", "password1", "password1"),
    ).rejects.toThrow("Email already in use.")

    expect(authWithPassword).not.toHaveBeenCalled()
  })
})
