"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import type { CashbackMatrix, MatrixState, SourceSubmission } from "@/lib/types"
import { ApiError, processSubmission } from "@/lib/api"

export function ProcessingScreen({
  submissions,
  existingMatrix,
  initialError,
  onDone,
  onBack,
  onError,
}: {
  submissions: SourceSubmission[]
  existingMatrix: MatrixState
  initialError: string | null
  onDone: (matrix: MatrixState) => void
  onBack: () => void
  onError: (message: string) => void
}) {
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(initialError)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (submissions.length === 0) {
      setError("Нет данных для обработки. Вернитесь и выберите скриншоты.")
      return
    }

    let cancelled = false

    async function run() {
      setError(null)
      setProgress(0)

      let bankMatrix: CashbackMatrix | null = existingMatrix.bank
      let marketMatrix: CashbackMatrix | null = existingMatrix.market
      const bankKeys = new Set(bankMatrix?.providers.map((provider) => provider.key) ?? [])
      const marketKeys = new Set(marketMatrix?.providers.map((provider) => provider.key) ?? [])

      try {
        for (let index = 0; index < submissions.length; index += 1) {
          if (cancelled) return

          const submission = submissions[index]
          const keys = submission.kind === "market" ? marketKeys : bankKeys
          const current = submission.kind === "market" ? marketMatrix : bankMatrix

          const result = await processSubmission(submission, keys, current)
          const provider = result.providers.find(
            (item) => item.name === submission.providerName.trim(),
          )
          if (provider) keys.add(provider.key)

          if (submission.kind === "market") {
            marketMatrix = result
          } else {
            bankMatrix = result
          }

          setProgress(index + 1)
        }

        if (!cancelled) {
          onDone({ bank: bankMatrix, market: marketMatrix })
        }
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof ApiError
            ? err.message
            : "Не удалось обработать скриншоты. Попробуйте ещё раз."
        setError(message)
        onError(message)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [submissions, existingMatrix, onDone, onError, retryKey])

  const total = submissions.length
  const label =
    progress > 0
      ? `Обрабатываем ${progress} из ${total}…`
      : "Распознавание данных со скриншота..."

  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center"
    >
      {!error ? (
        <>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <motion.span
              className="absolute inset-0 rounded-full bg-emerald-200"
              animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            />
            <motion.div
              className="relative h-16 w-16 rounded-full border-4 border-emerald-100 border-t-emerald-600"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            />
          </div>

          <p className="mt-8 text-[16px] font-semibold text-slate-900">{label}</p>
          <p className="mt-2 text-[14px] text-slate-500">Это может занять до минуты</p>
        </>
      ) : (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <p className="text-[16px] font-semibold text-slate-900">Ошибка обработки</p>
          <p className="text-[14px] leading-relaxed text-slate-500">{error}</p>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className="w-full rounded-2xl bg-yellow-200 px-5 py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300"
            >
              Повторить
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full rounded-2xl bg-slate-100 px-5 py-3.5 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-200"
            >
              Назад
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}