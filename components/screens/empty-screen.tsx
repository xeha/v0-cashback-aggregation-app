"use client"

import { motion } from "framer-motion"
import { CreditCard, ShoppingBag } from "lucide-react"

export function EmptyScreen({ onUpload }: { onUpload: (kind: "bank" | "market") => void }) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center"
    >
      <img
        src="/images/empty-cashback.png"
        alt="Иллюстрация: руки и категории кэшбэка"
        className="mb-8 mx-auto h-auto w-[30%] max-w-[30%]"
      />

      <h1 className="text-balance text-2xl font-bold leading-tight text-slate-900">
        У вас нет данных о кэшбеках
      </h1>
      <p className="mt-3 text-pretty text-[15px] leading-relaxed text-slate-500">
        Загрузите скриншоты из приложения банка или супермаркета, и мы автоматически распознаем ваши категории
      </p>

      <div className="mt-10 flex w-full flex-col gap-3">
        <h2 className="self-start text-[15px] font-semibold text-slate-900">Загрузить</h2>
        <button
          onClick={() => onUpload("bank")}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
        >
          <CreditCard className="h-5 w-5" />
          Из приложения банка
        </button>
        <button
          onClick={() => onUpload("market")}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 px-5 py-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700"
        >
          <ShoppingBag className="h-5 w-5" />
          Из супермаркета
        </button>
      </div>
    </motion.div>
  )
}
