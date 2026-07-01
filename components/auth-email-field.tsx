"use client"

import { useEmailBlurValidation } from "@/lib/use-email-blur-validation"

type AuthEmailFieldProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  onValidationReset?: () => void
  checkMx?: boolean
  autoComplete?: string
  placeholder?: string
}

export function AuthEmailField({
  id = "auth-email",
  value,
  onChange,
  onValidationReset,
  checkMx = true,
  autoComplete = "email",
  placeholder = "you@example.com",
}: AuthEmailFieldProps) {
  const { fieldError, fieldHint, isChecking, validateOnBlur, resetValidation } =
    useEmailBlurValidation({ checkMx })

  function handleChange(nextValue: string) {
    resetValidation()
    onValidationReset?.()
    onChange(nextValue)
  }

  const borderClass = fieldError
    ? "border-red-300 focus:border-red-400"
    : fieldHint
      ? "border-emerald-300 focus:border-emerald-400"
      : "border-slate-200 focus:border-slate-400"

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-slate-500">Email</span>
      <input
        id={id}
        type="email"
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => {
          if (value.trim()) {
            void validateOnBlur(value)
          }
        }}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={
          fieldError ? `${id}-error` : fieldHint ? `${id}-hint` : isChecking ? `${id}-checking` : undefined
        }
        className={`rounded-xl border px-4 py-3 text-[15px] text-slate-900 outline-none ${borderClass}`}
        placeholder={placeholder}
      />
      {isChecking && (
        <p id={`${id}-checking`} className="text-sm text-slate-400" role="status">
          Проверяем домен…
        </p>
      )}
      {!isChecking && fieldError && (
        <p id={`${id}-error`} className="text-sm text-red-600" role="alert">
          {fieldError}
        </p>
      )}
      {!isChecking && !fieldError && fieldHint && (
        <p id={`${id}-hint`} className="text-sm text-emerald-700" role="status">
          {fieldHint}
        </p>
      )}
    </label>
  )
}
