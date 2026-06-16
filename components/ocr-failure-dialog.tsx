"use client"

import { AnimatePresence, motion } from "framer-motion"

export function OcrFailureDialog({
  open,
  providerName,
  message,
  onReplace,
}: {
  open: boolean
  providerName: string
  message: string
  onReplace: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ocr-failure-title"
            className="flex w-full max-w-sm flex-col gap-4 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl sm:rounded-3xl sm:px-6 sm:py-6"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div>
              <h2 id="ocr-failure-title" className="text-[17px] font-bold text-slate-900">
                Не удалось распознать
              </h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                «{providerName}»: {message}
              </p>
            </div>

            <button
              type="button"
              onClick={onReplace}
              className="w-full rounded-2xl bg-yellow-200 px-4 py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300"
            >
              Заменить скриншот
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
