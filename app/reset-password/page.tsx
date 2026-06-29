"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthPageShell } from "@/components/auth-page-shell"
import { useAuth } from "@/lib/auth-context"

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resetPassword } = useAuth()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await resetPassword(token, password, passwordConfirm)
      router.replace("/verify-success?reset=1")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Произошла ошибка")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthPageShell
        title="Ссылка недействительна"
        description="Запросите новую ссылку для сброса пароля."
        backHref="/forgot-password"
        backLabel="Восстановить пароль"
      />
    )
  }

  return (
    <AuthPageShell
      title="Новый пароль"
      description="Придумайте надёжный пароль. Ссылка действует 1 час."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-slate-500">Новый пароль</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-slate-400"
            placeholder="Мин. 8 символов, заглавная, цифра, спецсимвол"
          />
        </label>

        <label className="flex flex-col gap-1.5">
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
        </label>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-yellow-200 px-5 py-4 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300 disabled:opacity-60"
        >
          {isSubmitting ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </AuthPageShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPageShell title="Загрузка…" />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
