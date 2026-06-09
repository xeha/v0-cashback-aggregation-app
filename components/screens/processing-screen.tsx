"use client"

import { motion } from "framer-motion"
import { useEffect } from "react"

export function ProcessingScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center"
    >
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

      <p className="mt-8 text-[16px] font-semibold text-slate-900">
        Распознавание данных со скриншота...
      </p>
      <p className="mt-2 text-[14px] text-slate-500">Это займёт пару секунд</p>
    </motion.div>
  )
}
