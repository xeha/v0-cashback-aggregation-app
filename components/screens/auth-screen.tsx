"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { Eye, EyeOff, X } from "lucide-react"
import { AuthEmailField } from "@/components/auth-email-field"
import { useAuth } from "@/lib/auth-context"

type AuthTab = "login" | "register"

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-slate-500">{label}</span>
      <div className="relative">
        <input
          id={id}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 py-3 pl-4 pr-12 text-[15px] text-slate-900 outline-none focus:border-slate-400"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setIsVisible((prev) => !prev)}
          aria-label={isVisible ? "Скрыть пароль" : "Показать пароль"}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          {isVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </label>
  )
}

type AuthScreenProps = {
  onClose?: () => void
}

type AuthView = "form" | "verification-sent" | "forgot-password"

export function AuthScreen({ onClose }: AuthScreenProps) {
  const { login, register, requestPasswordReset } = useAuth()
  const [view, setView] = useState<AuthView>("form")
  const [tab, setTab] = useState<AuthTab>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [verificationEmail, setVerificationEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setIsSubmitting(true)

    try {
      if (view === "forgot-password") {
        const message = await requestPasswordReset(email)
        setInfo(message)
        return
      }

      if (tab === "login") {
        await login(email, password)
        return
      }

      const result = await register(email, password, passwordConfirm)
      if (result.status === "verification-sent") {
        setVerificationEmail(result.email)
        setView("verification-sent")
        return
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Произошла ошибка")
    } finally {
      setIsSubmitting(false)
    }
  }

  function switchTab(nextTab: AuthTab) {
    setTab(nextTab)
    setError(null)
    setInfo(null)
    setPassword("")
    setPasswordConfirm("")
  }

  if (view === "verification-sent") {
    return (
      <motion.div
        key="verification-sent"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex min-h-full flex-col px-6 py-8"
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 text-4xl">✉️</div>
          <h2 className="text-xl font-bold text-slate-900">Проверьте email</h2>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-500">
            Мы отправили письмо на{" "}
            <span className="font-medium text-slate-700">{verificationEmail}</span>. Перейдите по
            ссылке в письме, чтобы подтвердить аккаунт. Ссылка действует 24 часа.
          </p>
          <p className="mt-4 text-sm text-slate-400">
            Не регистрировались?{" "}
            <a href="mailto:support@cashbackbrain.ru" className="text-slate-600 underline">
              Напишите в поддержку
            </a>
          </p>
          <Link
            href={`/verify-error?email=${encodeURIComponent(verificationEmail)}`}
            className="mt-6 text-sm font-medium text-slate-600 underline"
          >
            Не пришло письмо?
          </Link>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      key="auth"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex min-h-full flex-col px-6 py-8"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">CashbackBrain</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
          {view === "forgot-password"
            ? "Введите email — мы отправим ссылку для сброса пароля"
            : "Войдите или создайте аккаунт, чтобы сохранять результаты"}
        </p>
      </div>

      {view === "form" && (
        <div className="mb-6 flex rounded-2xl bg-slate-100 p-1">
          {(
            [
              { key: "login", label: "Вход" },
              { key: "register", label: "Регистрация" },
            ] as { key: AuthTab; label: string }[]
          ).map((item) => {
            const isActive = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => switchTab(item.key)}
                className="relative flex-1 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-colors"
              >
                {isActive && (
                  <motion.span
                    layoutId="auth-tab-pill"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-white shadow-sm"
                  />
                )}
                <span className={`relative z-10 ${isActive ? "text-slate-900" : "text-slate-500"}`}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
        <AuthEmailField
          key={`email-${view}-${tab}`}
          id="auth-email"
          value={email}
          onChange={setEmail}
          onValidationReset={() => setError(null)}
          checkMx={view === "forgot-password" || tab === "register"}
        />

        {view === "form" && (
          <>
            <PasswordField
              key={`password-${tab}`}
              id="auth-password"
              label="Пароль"
              value={password}
              onChange={setPassword}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              placeholder={
                tab === "register"
                  ? "Мин. 8 символов, заглавная, цифра, спецсимвол"
                  : undefined
              }
            />

            {tab === "register" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
              >
                <PasswordField
                  key="password-confirm"
                  id="auth-password-confirm"
                  label="Повторите пароль"
                  value={passwordConfirm}
                  onChange={setPasswordConfirm}
                  autoComplete="new-password"
                />
              </motion.div>
            )}

            {tab === "login" && (
              <button
                type="button"
                onClick={() => {
                  setView("forgot-password")
                  setError(null)
                  setInfo(null)
                  setPassword("")
                }}
                className="self-start text-sm font-medium text-slate-500 underline"
              >
                Забыли пароль?
              </button>
            )}
          </>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {info && (
          <p className="text-sm text-emerald-700" role="status">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-auto w-full rounded-2xl bg-yellow-200 px-5 py-4 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300 active:bg-yellow-400 disabled:opacity-60"
        >
          {isSubmitting
            ? "Подождите…"
            : view === "forgot-password"
              ? "Восстановить пароль"
              : tab === "login"
                ? "Войти"
                : "Создать аккаунт"}
        </button>

        {view === "forgot-password" && (
          <button
            type="button"
            onClick={() => {
              setView("form")
              setError(null)
              setInfo(null)
            }}
            className="text-center text-sm font-medium text-slate-500"
          >
            ← Вернуться ко входу
          </button>
        )}
      </form>
    </motion.div>
  )
}
