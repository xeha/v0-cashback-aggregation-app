"use client"

import { X } from "lucide-react"
import { motion } from "framer-motion"

export function GuestSaveBanner({
  onLoginRequest,
  onDismiss,
}: {
  onLoginRequest: () => void
  onDismiss: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-slate-900">Сохранить кешбэки?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Войдите, чтобы не потерять их при закрытии приложения
          </p>
          <button
            type="button"
            onClick={onLoginRequest}
            className="mt-3 rounded-xl bg-yellow-200 px-4 py-2 text-[14px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300"
          >
            Войти / создать аккаунт
          </button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрыть"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-yellow-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}
