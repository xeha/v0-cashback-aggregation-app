"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AuthEmailField } from "@/components/auth-email-field"
import { AuthPageShell } from "@/components/auth-page-shell"
import { useAuth } from "@/lib/auth-context"

function VerifyErrorContent() {
  const searchParams = useSearchParams()
  const { resendVerification } = useAuth()
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleResend(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setIsSubmitting(true)

    try {
      const message = await resendVerification(email)
      setInfo(message)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Произошла ошибка")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageShell
      title="Подтверждение не удалось"
      description="Ссылка могла истечь или уже была использована. Запросите новое письмо."
    >
      <form onSubmit={handleResend} className="flex flex-col gap-4">
        <AuthEmailField
          id="verify-error-email"
          value={email}
          onChange={setEmail}
          onValidationReset={() => setError(null)}
        />

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
          className="w-full rounded-2xl bg-yellow-200 px-5 py-4 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300 disabled:opacity-60"
        >
          {isSubmitting ? "Отправляем…" : "Отправить письмо повторно"}
        </button>
      </form>
    </AuthPageShell>
  )
}

export default function VerifyErrorPage() {
  return (
    <Suspense fallback={<AuthPageShell title="Загрузка…" />}>
      <VerifyErrorContent />
    </Suspense>
  )
}
