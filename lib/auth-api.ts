import { ApiError } from "@/lib/api"
import { getBackendUrl } from "@/lib/backend-url"

const MX_CHECK_TIMEOUT_MS = 10_000

/** Only for E2E/CI without running FastAPI. */
export const AUTH_SKIP_MX_CHECK = process.env.NEXT_PUBLIC_AUTH_SKIP_MX_CHECK === "true"

export type ValidateEmailMxResult = {
  valid: true
  email: string
  domain: string
  mx: boolean
}

export async function validateEmailMx(email: string): Promise<ValidateEmailMxResult> {
  if (AUTH_SKIP_MX_CHECK) {
    return {
      valid: true,
      email: email.trim().toLowerCase(),
      domain: email.trim().toLowerCase().split("@")[1] ?? "",
      mx: true,
    }
  }

  let response: Response
  try {
    response = await fetch(`${getBackendUrl()}/api/auth/validate-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(MX_CHECK_TIMEOUT_MS),
    })
  } catch {
    throw new ApiError(
      "Сервер недоступен. Запустите FastAPI: cd backend && uvicorn main:app --reload --port 8000",
      0,
    )
  }

  if (!response.ok) {
    let message = "Не удалось проверить email"
    try {
      const body = (await response.json()) as {
        detail?: { error?: { message?: string } } | string
      }
      if (typeof body.detail === "object" && body.detail?.error?.message) {
        message = body.detail.error.message
      } else if (typeof body.detail === "string") {
        message = body.detail
      }
    } catch {
      // keep default message
    }
    throw new ApiError(message, response.status)
  }

  return (await response.json()) as ValidateEmailMxResult
}
