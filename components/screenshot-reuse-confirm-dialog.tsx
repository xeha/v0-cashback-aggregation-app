"use client"

import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

export interface ScreenshotReuseConflict {
  originalProviderName: string
  newProviderName: string
}

function formatName(name: string): string {
  return `«${name}»`
}

function formatConflictDescription(conflicts: ScreenshotReuseConflict[]): string {
  if (conflicts.length === 1) {
    const { originalProviderName, newProviderName } = conflicts[0]
    return `Этот скриншот уже привязан к ${formatName(originalProviderName)}. Выберите другое фото или укажите то же название вместо ${formatName(newProviderName)}.`
  }

  const examples = conflicts
    .slice(0, 2)
    .map(
      ({ originalProviderName, newProviderName }) =>
        `${formatName(originalProviderName)} и ${formatName(newProviderName)}`,
    )
    .join(", ")

  const suffix = conflicts.length > 2 ? " и другим источникам" : ""
  return `Один и тот же скриншот указан для разных источников: ${examples}${suffix}. Исправьте названия или замените фото.`
}

export function ScreenshotReuseConfirmDialog({
  open,
  conflicts,
  onDismiss,
}: {
  open: boolean
  conflicts: ScreenshotReuseConflict[]
  onDismiss: () => void
}) {
  const isSingle = conflicts.length === 1
  const title = isSingle ? "Скриншот уже добавлен" : "Один скриншот — разные источники"

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="screenshot-reuse-error-title"
            className="flex w-full max-w-sm flex-col gap-4 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl sm:rounded-3xl sm:px-6 sm:py-6"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="screenshot-reuse-error-title"
                  className="text-[17px] font-bold text-slate-900"
                >
                  {title}
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                  {formatConflictDescription(conflicts)}
                </p>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Закрыть"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-2xl bg-yellow-200 px-4 py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300"
            >
              Понятно
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
