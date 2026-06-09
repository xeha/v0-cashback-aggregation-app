"use client"

import { motion } from "framer-motion"
import { CreditCard, ShoppingBag } from "lucide-react"

export function EmptyScreen({ onUpload }: { onUpload: () => void }) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100">
        <CreditCard className="h-9 w-9 text-slate-400" strokeWidth={1.75} />
      </div>

      <h1 className="text-balance text-2xl font-bold leading-tight text-slate-900">
        У вас нет данных о кэшбеках
      </h1>
      <p className="mt-3 text-pretty text-[15px] leading-relaxed text-slate-500">
        Загрузите скриншоты из приложения банка или супермаркета, и мы автоматически распознаем ваши категории
      </p>

      <div className="mt-10 flex w-full flex-col gap-3">
        <button
          onClick={onUpload}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
        >
          <CreditCard className="h-5 w-5" />
          Загрузить скриншоты банка
        </button>
        <button
          onClick={onUpload}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 px-5 py-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700"
        >
          <ShoppingBag className="h-5 w-5" />
          Загрузить скриншоты супермаркета
        </button>
      </div>
    </motion.div>
  )
}
