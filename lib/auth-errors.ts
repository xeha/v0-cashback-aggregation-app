import { ClientResponseError } from "pocketbase"

const STATUS_MESSAGES: Record<number, string> = {
  400: "Проверьте введённые данные",
  401: "Неверный email или пароль",
  403: "Доступ запрещён",
  404: "Ссылка недействительна или устарела",
  409: "Этот email уже зарегистрирован",
  429: "Слишком много попыток. Попробуйте позже",
}

const MESSAGE_OVERRIDES: Record<string, string> = {
  "Invalid login credentials.": "Неверный email или пароль",
  "Failed to authenticate.": "Неверный email или пароль",
  "The request doesn't satisfy the collection auth requirements.":
    "Подтвердите email перед входом",
  "Your account is not verified.": "Подтвердите email перед входом",
  "Email already in use.": "Этот email уже зарегистрирован",
}

export function formatAuthError(error: unknown): string {
  if (error instanceof ClientResponseError) {
    const data = error.response?.data as Record<string, unknown> | undefined

    if (data?.message && typeof data.message === "string") {
      return MESSAGE_OVERRIDES[data.message] ?? data.message
    }

    if (data?.email && typeof data.email === "object" && data.email !== null) {
      const emailErr = data.email as { message?: string }
      if (emailErr.message) {
        return MESSAGE_OVERRIDES[emailErr.message] ?? emailErr.message
      }
    }

    if (data?.password && typeof data.password === "object" && data.password !== null) {
      const passwordErr = data.password as { message?: string }
      if (passwordErr.message) {
        return MESSAGE_OVERRIDES[passwordErr.message] ?? passwordErr.message
      }
    }

    if (data?.token && typeof data.token === "object" && data.token !== null) {
      const tokenErr = data.token as { message?: string }
      if (tokenErr.message) {
        return "Ссылка недействительна или устарела"
      }
    }

    if (error.status === 401) {
      return STATUS_MESSAGES[401]
    }

    return STATUS_MESSAGES[error.status] ?? "Не удалось выполнить вход. Попробуйте снова"
  }

  if (error instanceof Error) {
    return MESSAGE_OVERRIDES[error.message] ?? error.message
  }

  return "Произошла ошибка. Попробуйте снова"
}

export const GENERIC_PASSWORD_RESET_MESSAGE =
  "Если email зарегистрирован, мы отправили инструкции по восстановлению"

export const GENERIC_VERIFICATION_RESENT_MESSAGE =
  "Если email зарегистрирован и не подтверждён, мы отправили письмо"
