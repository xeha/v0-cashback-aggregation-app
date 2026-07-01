import Link from "next/link"
import { AuthPageShell } from "@/components/auth-page-shell"

type VerifySuccessPageProps = {
  searchParams?: Promise<{ reset?: string }>
}

export default async function VerifySuccessPage({ searchParams }: VerifySuccessPageProps) {
  const params = searchParams ? await searchParams : {}
  const isPasswordReset = params.reset === "1"

  return (
    <AuthPageShell
      title={isPasswordReset ? "Пароль изменён" : "Email подтверждён"}
      description={
        isPasswordReset
          ? "Пароль успешно обновлён. Все предыдущие сессии завершены. Войдите с новым паролем."
          : "Теперь вы можете войти в CashbackBrain и сохранять результаты."
      }
    >
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="w-full rounded-2xl bg-yellow-200 px-5 py-4 text-center text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300"
        >
          {isPasswordReset ? "Перейти ко входу" : "Войти в приложение"}
        </Link>
      </div>
    </AuthPageShell>
  )
}
