import {
  COMMON_PASSWORDS,
  DISPOSABLE_EMAIL_DOMAINS,
  ROLE_BASED_EMAIL_LOCALS,
} from "@/lib/auth-validation-data"

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

const EMAIL_MIN_LENGTH = 5
const EMAIL_MAX_LENGTH = 254
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128

const PASSWORD_HAS_UPPER = /[A-Z]/
const PASSWORD_HAS_LOWER = /[a-z]/
const PASSWORD_HAS_DIGIT = /\d/
const PASSWORD_HAS_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/

export type ValidationResult =
  | { ok: true; email: string }
  | { ok: false; message: string; field?: string }

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; message: string; field: "password" }

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateEmailFormat(email: string): ValidationResult {
  const normalized = normalizeEmail(email)

  if (!normalized) {
    return { ok: false, message: "Введите email", field: "email" }
  }

  if (normalized.length < EMAIL_MIN_LENGTH) {
    return { ok: false, message: "Email слишком короткий", field: "email" }
  }

  if (normalized.length > EMAIL_MAX_LENGTH) {
    return { ok: false, message: "Email слишком длинный (максимум 254 символа)", field: "email" }
  }

  if (!EMAIL_REGEX.test(normalized)) {
    return {
      ok: false,
      message: "Email должен быть в формате user@example.com",
      field: "email",
    }
  }

  const atMatch = normalized.match(/^([^@]+)@(.+)$/)
  const local = atMatch?.[1] ?? ""
  const domain = atMatch?.[2] ?? ""
  const localPart = local.split("+")[0]

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      ok: false,
      message: "Временные email-адреса не поддерживаются",
      field: "email",
    }
  }

  if (ROLE_BASED_EMAIL_LOCALS.has(localPart)) {
    return {
      ok: false,
      message: "Используйте личный email, а не служебный (admin@, info@ и т.д.)",
      field: "email",
    }
  }

  return { ok: true, email: normalized }
}

export function validatePasswordStrength(
  password: string,
  email?: string,
): PasswordValidationResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: "Пароль должен быть не короче 8 символов",
      field: "password",
    }
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      message: "Пароль слишком длинный (максимум 128 символов)",
      field: "password",
    }
  }

  if (!PASSWORD_HAS_UPPER.test(password)) {
    return {
      ok: false,
      message: "Пароль должен содержать хотя бы одну заглавную букву",
      field: "password",
    }
  }

  if (!PASSWORD_HAS_LOWER.test(password)) {
    return {
      ok: false,
      message: "Пароль должен содержать хотя бы одну строчную букву",
      field: "password",
    }
  }

  if (!PASSWORD_HAS_DIGIT.test(password)) {
    return {
      ok: false,
      message: "Пароль должен содержать хотя бы одну цифру",
      field: "password",
    }
  }

  if (!PASSWORD_HAS_SPECIAL.test(password)) {
    return {
      ok: false,
      message: "Пароль должен содержать хотя бы один спецсимвол (!@#$%^&* и т.д.)",
      field: "password",
    }
  }

  if (COMMON_PASSWORDS.has(password) || COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      message: "Этот пароль слишком распространённый — выберите другой",
      field: "password",
    }
  }

  if (email) {
    const normalized = normalizeEmail(email)
    const localPart = normalized.split("@")[0]?.split("+")[0] ?? ""
    if (localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
      return {
        ok: false,
        message: "Пароль не должен совпадать с частью email",
        field: "password",
      }
    }
  }

  return { ok: true }
}

export function validateRegisterInput(
  email: string,
  password: string,
  passwordConfirm: string,
): ValidationResult {
  const emailResult = validateEmailFormat(email)
  if (!emailResult.ok) {
    return emailResult
  }

  const passwordResult = validatePasswordStrength(password, emailResult.email)
  if (!passwordResult.ok) {
    return passwordResult
  }

  if (password !== passwordConfirm) {
    return { ok: false, message: "Пароли не совпадают", field: "passwordConfirm" }
  }

  return { ok: true, email: emailResult.email }
}

export function validateLoginInput(email: string, password: string): ValidationResult {
  const emailResult = validateEmailFormat(email)
  if (!emailResult.ok) {
    return emailResult
  }

  if (!password) {
    return { ok: false, message: "Введите пароль", field: "password" }
  }

  return { ok: true, email: emailResult.email }
}

export function validateForgotPasswordInput(email: string): ValidationResult {
  return validateEmailFormat(email)
}

export function validateResetPasswordInput(
  password: string,
  passwordConfirm: string,
  email?: string,
): ValidationResult {
  const passwordResult = validatePasswordStrength(password, email)
  if (!passwordResult.ok) {
    return passwordResult
  }

  if (password !== passwordConfirm) {
    return { ok: false, message: "Пароли не совпадают", field: "passwordConfirm" }
  }

  return { ok: true, email: email ?? "" }
}
