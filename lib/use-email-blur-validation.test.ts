// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { ApiError } from "@/lib/api"
import { useEmailBlurValidation } from "@/lib/use-email-blur-validation"

vi.mock("@/lib/auth-api", () => ({
  validateEmailMx: vi.fn(),
}))

import { validateEmailMx } from "@/lib/auth-api"

const mockedValidateEmailMx = vi.mocked(validateEmailMx)

describe("useEmailBlurValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sets format error without calling MX API", async () => {
    const { result } = renderHook(() => useEmailBlurValidation())

    await act(async () => {
      await result.current.validateOnBlur("not-an-email")
    })

    expect(result.current.fieldError).toBeTruthy()
    expect(mockedValidateEmailMx).not.toHaveBeenCalled()
  })

  it("calls MX API and shows hint on success", async () => {
    mockedValidateEmailMx.mockResolvedValue({
      valid: true,
      email: "user@example.com",
      domain: "example.com",
      mx: true,
    })

    const { result } = renderHook(() => useEmailBlurValidation())

    await act(async () => {
      await result.current.validateOnBlur("user@example.com")
    })

    expect(mockedValidateEmailMx).toHaveBeenCalledWith("user@example.com")
    expect(result.current.fieldHint).toBe("Домен принимает почту")
    expect(result.current.fieldError).toBeNull()
  })

  it("shows MX error from API", async () => {
    mockedValidateEmailMx.mockRejectedValue(
      new ApiError("Домен email не принимает почту — проверьте адрес", 400),
    )

    const { result } = renderHook(() => useEmailBlurValidation())

    await act(async () => {
      await result.current.validateOnBlur("user@example.com")
    })

    expect(result.current.fieldError).toBe("Домен email не принимает почту — проверьте адрес")
  })

  it("skips MX when checkMx is false", async () => {
    const { result } = renderHook(() => useEmailBlurValidation({ checkMx: false }))

    await act(async () => {
      const ok = await result.current.validateOnBlur("user@example.com")
      expect(ok).toBe(true)
    })

    expect(mockedValidateEmailMx).not.toHaveBeenCalled()
    expect(result.current.fieldError).toBeNull()
  })
})
