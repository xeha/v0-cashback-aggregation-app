// @vitest-environment jsdom

import { createElement, type ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { AuthProvider, useAuth } from "@/lib/auth-context"

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
})
