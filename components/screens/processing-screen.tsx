"use client"

import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { OcrFailureDialog } from "@/components/ocr-failure-dialog"
import {
  ApiError,
  isOcrRecognitionFailure,
  processSubmissionWithKeyTracking,
} from "@/lib/api"
import type {
  CashbackMatrix,
  LowConfidenceItem,
  MatrixState,
  ProcessingSummary,
  SourceSubmission,
} from "@/lib/types"

interface BatchProgress {
  index: number
  bankMatrix: CashbackMatrix | null
  marketMatrix: CashbackMatrix | null
  bankKeys: Set<string>
  marketKeys: Set<string>
  lowConfidence: LowConfidenceItem[]
}

interface OcrFailureState {
  submission: SourceSubmission
  message: string
}

interface ActiveStep {
  index: number
  providerName: string
}

function getProcessingHint(total: number): string {
  if (total <= 1) return "Обычно до 30 секунд · при сбое — ошибка через 1 мин"
  const estimateMinutes = Math.max(1, Math.ceil((total * 30) / 60))
  return `До ${estimateMinutes} мин · около 30 сек на скриншот · при сбое — ошибка через 1 мин`
}

function cloneKeySet(keys: Set<string>): Set<string> {
  return new Set(keys)
}

function createInitialBatch(existingMatrix: MatrixState): BatchProgress {
  return {
    index: 0,
    bankMatrix: existingMatrix.bank,
    marketMatrix: existingMatrix.market,
    bankKeys: new Set(existingMatrix.bank?.providers.map((provider) => provider.key) ?? []),
    marketKeys: new Set(existingMatrix.market?.providers.map((provider) => provider.key) ?? []),
    lowConfidence: [],
  }
}

export function ProcessingScreen({
  submissions,
  existingMatrix,
  initialError,
  onDone,
  onBack,
  onOcrFailure,
  onGeneralFailure,
  onReplaceScreenshot,
  onError,
}: {
  submissions: SourceSubmission[]
  existingMatrix: MatrixState
  initialError: string | null
  onDone: (matrix: MatrixState, summary: ProcessingSummary) => void
  onBack: () => void
  onOcrFailure: (
    partialMatrix: MatrixState,
    failedIndex: number,
    partialSummary: ProcessingSummary,
    processedSubmissions: SourceSubmission[],
  ) => void
  onGeneralFailure: (
    partialMatrix: MatrixState,
    failedIndex: number,
    partialSummary: ProcessingSummary,
    processedSubmissions: SourceSubmission[],
  ) => void
  onReplaceScreenshot: () => void
  onError: (message: string) => void
}) {
  const [progress, setProgress] = useState(0)
  const [activeStep, setActiveStep] = useState<ActiveStep | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [retryKey, setRetryKey] = useState(0)
  const [ocrFailure, setOcrFailure] = useState<OcrFailureState | null>(null)

  const runGenerationRef = useRef(0)
  const waitingForUserRef = useRef(false)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  const onOcrFailureRef = useRef(onOcrFailure)
  const onGeneralFailureRef = useRef(onGeneralFailure)

  onDoneRef.current = onDone
  onErrorRef.current = onError
  onOcrFailureRef.current = onOcrFailure
  onGeneralFailureRef.current = onGeneralFailure

  useEffect(() => {
    if (waitingForUserRef.current) return

    if (submissions.length === 0) {
      setError("Нет данных для обработки. Вернитесь и выберите скриншоты.")
      return
    }

    const runGeneration = runGenerationRef.current + 1
    runGenerationRef.current = runGeneration
    let cancelled = false

    setError(null)
    setProgress(0)
    setActiveStep({
      index: 1,
      providerName: submissions[0]?.providerName ?? "",
    })
    setOcrFailure(null)

    async function runBatch(batch: BatchProgress) {
      let state = {
        ...batch,
        bankKeys: cloneKeySet(batch.bankKeys),
        marketKeys: cloneKeySet(batch.marketKeys),
      }

      for (let index = state.index; index < submissions.length; index += 1) {
        if (cancelled || runGenerationRef.current !== runGeneration) return

        const submission = submissions[index]
        const keys = submission.kind === "market" ? state.marketKeys : state.bankKeys
        const current = submission.kind === "market" ? state.marketMatrix : state.bankMatrix

        setActiveStep({ index: index + 1, providerName: submission.providerName })

        try {
          const result = await processSubmissionWithKeyTracking(submission, keys, current)

          if (cancelled || runGenerationRef.current !== runGeneration) return

          if (submission.kind === "market") {
            state = { ...state, marketMatrix: result.matrix }
          } else {
            state = { ...state, bankMatrix: result.matrix }
          }

          if (result.lowConfidenceItems.length > 0) {
            state = {
              ...state,
              lowConfidence: [...state.lowConfidence, ...result.lowConfidenceItems],
            }
          }

          state = { ...state, index: index + 1 }
          setProgress(index + 1)
        } catch (err) {
          if (cancelled || runGenerationRef.current !== runGeneration) return

          if (isOcrRecognitionFailure(err)) {
            waitingForUserRef.current = true
            const message =
              err instanceof ApiError
                ? err.message
                : "Не удалось распознать категории на скриншоте."
            onOcrFailureRef.current(
              {
                bank: state.bankMatrix,
                market: state.marketMatrix,
              },
              index,
              {
                skipped: [],
                lowConfidence: state.lowConfidence,
              },
              submissions.slice(0, index),
            )
            setOcrFailure({ submission, message })
            return
          }

          const message =
            err instanceof ApiError
              ? err.message
              : "Не удалось обработать скриншоты. Попробуйте ещё раз."

          if (index > 0) {
            waitingForUserRef.current = true
            onGeneralFailureRef.current(
              {
                bank: state.bankMatrix,
                market: state.marketMatrix,
              },
              index,
              {
                skipped: [],
                lowConfidence: state.lowConfidence,
              },
              submissions.slice(0, index),
            )
          }

          setError(message)
          onErrorRef.current(message)
          return
        }
      }

      if (cancelled || runGenerationRef.current !== runGeneration || waitingForUserRef.current) {
        return
      }

      onDoneRef.current(
        {
          bank: state.bankMatrix,
          market: state.marketMatrix,
        },
        {
          skipped: [],
          lowConfidence: state.lowConfidence,
        },
      )
    }

    runBatch(createInitialBatch(existingMatrix))

    return () => {
      cancelled = true
    }
  }, [submissions, existingMatrix, retryKey])

  function handleReplaceFromDialog() {
    if (!ocrFailure) return
    waitingForUserRef.current = false
    runGenerationRef.current += 1
    setOcrFailure(null)
    onReplaceScreenshot()
  }

  const total = submissions.length
  const isWaitingForUser = ocrFailure !== null
  const currentIndex = activeStep?.index ?? 1
  const label =
    total > 1
      ? `Обрабатываем ${currentIndex} из ${total}…`
      : "Распознавание данных со скриншота…"
  const providerLabel = activeStep?.providerName ? `«${activeStep.providerName}»` : null
  const hint = getProcessingHint(total)

  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="relative flex min-h-full flex-col items-center justify-center px-6 py-12 text-center"
    >
      {!error && !isWaitingForUser ? (
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
          {providerLabel ? (
            <p className="mt-1.5 text-[14px] font-medium text-slate-700">{providerLabel}</p>
          ) : null}
          <p className="mt-2 text-[14px] text-slate-500">{hint}</p>
          {total > 1 && progress > 0 ? (
            <p className="mt-1 text-[13px] text-slate-400">
              Готово: {progress} из {total}
            </p>
          ) : null}
        </>
      ) : !isWaitingForUser ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <p className="text-[16px] font-semibold text-slate-900">Ошибка обработки</p>
          <p className="text-[14px] leading-relaxed text-slate-500">{error}</p>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                waitingForUserRef.current = false
                setRetryKey((value) => value + 1)
              }}
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
      ) : null}

      <OcrFailureDialog
        open={ocrFailure !== null}
        providerName={ocrFailure?.submission.providerName ?? ""}
        message={ocrFailure?.message ?? ""}
        onReplace={handleReplaceFromDialog}
      />
    </motion.div>
  )
}