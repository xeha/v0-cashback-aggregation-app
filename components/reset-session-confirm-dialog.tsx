"use client"

import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

export function ResetSessionConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
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
            aria-labelledby="reset-session-dialog-title"
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
                  id="reset-session-dialog-title"
                  className="text-[17px] font-bold text-slate-900"
                >
                  Начать новую сборку?
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                  Текущие данные о кешбэках сбросятся, и вы начнёте с новых скриншотов. Ранее сохранённые сборки останутся в профиле — найти их можно через меню.
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
                Начать заново
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-2xl bg-slate-100 px-4 py-3.5 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-200"
              >
                Отмена
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
