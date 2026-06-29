"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

type AuthTab = "login" | "register"

type AuthScreenProps = {
  onClose?: () => void
}

export function AuthScreen({ onClose }: AuthScreenProps) {
  const { login, register } = useAuth()
  const [tab, setTab] = useState<AuthTab>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      if (tab === "login") {
        await login(email, password)
      } else {
        await register(email, password, passwordConfirm)
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
    setPassword("")
    setPasswordConfirm("")
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
          Войдите или создайте аккаунт, чтобы сохранять результаты
        </p>
      </div>

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

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-slate-500">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-slate-400"
            placeholder="you@example.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-slate-500">Пароль</span>
          <input
            type="password"
            autoComplete={tab === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-slate-400"
            placeholder="Минимум 8 символов"
          />
        </label>

        {tab === "register" && (
          <motion.label
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex flex-col gap-1.5"
          >
            <span className="text-[13px] font-medium text-slate-500">Повторите пароль</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-slate-400"
            />
          </motion.label>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-auto w-full rounded-2xl bg-yellow-200 px-5 py-4 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300 active:bg-yellow-400 disabled:opacity-60"
        >
          {isSubmitting
            ? "Подождите…"
            : tab === "login"
              ? "Войти"
              : "Создать аккаунт"}
        </button>
      </form>
    </motion.div>
  )
}
