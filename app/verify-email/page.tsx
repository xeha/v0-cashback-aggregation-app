"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthPageShell } from "@/components/auth-page-shell"
import { useAuth } from "@/lib/auth-context"

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { confirmEmailVerification } = useAuth()
  const [status, setStatus] = useState<"loading" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setStatus("error")
      setErrorMessage("Ссылка недействительна или устарела")
      return
    }

    async function verify() {
      try {
        await confirmEmailVerification(token!)
        router.replace("/verify-success")
      } catch (error) {
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Не удалось подтвердить email")
      }
    }

    void verify()
  }, [confirmEmailVerification, router, searchParams])

  if (status === "loading") {
    return (
      <AuthPageShell title="Подтверждение email" description="Проверяем ссылку…">
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-yellow-400" />
        </div>
      </AuthPageShell>
    )
  }

  return (
    <AuthPageShell
      title="Не удалось подтвердить"
      description={errorMessage ?? "Ссылка недействительна или устарела"}
      backHref="/verify-error"
      backLabel="Запросить новое письмо"
    />
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthPageShell title="Подтверждение email" description="Загрузка…">
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-yellow-400" />
          </div>
        </AuthPageShell>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
