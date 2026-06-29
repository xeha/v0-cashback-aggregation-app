"use client"

import Link from "next/link"
import type { ReactNode } from "react"

type AuthPageShellProps = {
  title: string
  description?: string
  children: ReactNode
  backHref?: string
  backLabel?: string
}

export function AuthPageShell({
  title,
  description,
  children,
  backHref = "/",
  backLabel = "На главную",
}: AuthPageShellProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100 sm:py-8">
      <div className="flex h-dvh w-full flex-col overflow-y-auto bg-white px-6 py-8 sm:h-auto sm:max-w-md sm:rounded-3xl sm:shadow-xl">
        <Link
          href={backHref}
          className="mb-6 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          ← {backLabel}
        </Link>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {description && (
            <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{description}</p>
          )}
        </div>

        {children}
      </div>
    </main>
  )
}
