"use client"

import { motion } from "framer-motion"

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
        className="mb-8 mx-auto h-auto w-[30vw]"
      />

      <h1 className="text-balance text-2xl font-bold leading-tight text-slate-900">
        У вас нет данных о кэшбеках
      </h1>
      <p className="mt-3 text-pretty text-[15px] leading-relaxed text-slate-500">
        Просто загрузите скриншоты ваших категорий из банков и магазинов
      </p>

      <div className="mt-10 flex w-full flex-col gap-3">
        <button
          onClick={() => onUpload("bank")}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-yellow-200 px-5 py-4 text-slate-900 shadow-sm transition-colors hover:bg-yellow-300 active:bg-yellow-400"
        >
          <span className="text-[15px] font-semibold">Выбрать скриншоты</span>
          <span className="text-[13px] font-medium text-slate-700">Сбер, Т-Банк, Магнит, Пятерочка и другие</span>
        </button>
      </div>
    </motion.div>
  )
}
