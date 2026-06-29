export type RegisterValidationResult =
  | { ok: true; email: string }
  | { ok: false; message: string }

export function validateRegisterInput(
  email: string,
  password: string,
  passwordConfirm: string,
): RegisterValidationResult {
  const trimmedEmail = email.trim()

  if (!trimmedEmail) {
    return { ok: false, message: "Введите email" }
  }

  if (password.length < 8) {
    return { ok: false, message: "Пароль должен быть не короче 8 символов" }
  }

  if (password !== passwordConfirm) {
    return { ok: false, message: "Пароли не совпадают" }
  }

  return { ok: true, email: trimmedEmail }
}
