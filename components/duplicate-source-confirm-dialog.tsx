"use client"

import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

function formatProviderList(names: string[]): string {
  if (names.length === 1) return `«${names[0]}»`
  if (names.length === 2) return `«${names[0]}» и «${names[1]}»`
  const head = names.slice(0, -1).map((name) => `«${name}»`).join(", ")
  return `${head} и «${names[names.length - 1]}»`
}

export function DuplicateSourceConfirmDialog({
  open,
  providerNames,
  onConfirm,
  onCancel,
}: {
  open: boolean
  providerNames: string[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const isSingle = providerNames.length === 1
  const title = isSingle ? "Источник уже добавлен" : "Повторяющиеся источники"
  const description = isSingle
    ? `Кэшбек по ${formatProviderList(providerNames)} уже есть в списке. Дополнить его категориями из нового скриншота?`
    : `Источники ${formatProviderList(providerNames)} указаны несколько раз. Объединить категории из всех скриншотов в одну колонку?`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-source-confirm-title"
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
                  id="duplicate-source-confirm-title"
                  className="text-[17px] font-bold text-slate-900"
                >
                  {title}
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                  {description}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Закрыть"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onConfirm}
                className="w-full rounded-2xl bg-yellow-200 px-4 py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300"
              >
                Да, дополнить
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-2xl bg-slate-100 px-4 py-3.5 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-200"
              >
                Назад
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
