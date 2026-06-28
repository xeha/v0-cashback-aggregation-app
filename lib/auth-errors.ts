import { ClientResponseError } from "pocketbase"

const STATUS_MESSAGES: Record<number, string> = {
  400: "Проверьте введённые данные",
  403: "Доступ запрещён",
  404: "Сервис авторизации недоступен",
  429: "Слишком много попыток. Попробуйте позже",
}

export function formatAuthError(error: unknown): string {
  if (error instanceof ClientResponseError) {
    const data = error.response?.data as Record<string, unknown> | undefined

    if (data?.message && typeof data.message === "string") {
      return data.message
    }

    if (data?.email && typeof data.email === "object" && data.email !== null) {
      const emailErr = data.email as { message?: string }
      if (emailErr.message) return emailErr.message
    }

    if (data?.password && typeof data.password === "object" && data.password !== null) {
      const passwordErr = data.password as { message?: string }
      if (passwordErr.message) return passwordErr.message
    }

    return STATUS_MESSAGES[error.status] ?? "Не удалось выполнить вход. Попробуйте снова"
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Произошла ошибка. Попробуйте снова"
}
