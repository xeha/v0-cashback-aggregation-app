"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Plus, X } from "lucide-react"
import { useRef, useState } from "react"
import { TOP_BANKS } from "@/lib/cashback-data"
import { GalleryScreen } from "@/components/screens/gallery-screen"

export function BankSelectScreen({
  onBack,
  onNext,
}: {
  onBack: () => void
  onNext: () => void
}) {
  const [banks, setBanks] = useState<string[]>([""])
  // Index of the bank row that is awaiting a name after a screenshot was added.
  // null = gallery picker is closed.
  const [pendingBankIndex, setPendingBankIndex] = useState<number | null>(null)
  const focusIndexRef = useRef<number | null>(null)

  function updateBank(index: number, value: string) {
    setBanks((prev) => prev.map((b, i) => (i === index ? value : b)))
  }

  // Step 1: open the gallery so the user adds a screenshot first.
  function startAddBank() {
    setPendingBankIndex(banks.length)
  }

  // Step 2: screenshot added — create the new bank row and prompt for its name.
  function handleScreenshotAdded() {
    const newIndex = banks.length
    setBanks((prev) => [...prev, ""])
    setPendingBankIndex(null)
    focusIndexRef.current = newIndex
  }

  function removeBank(index: number) {
    setBanks((prev) => prev.filter((_, i) => i !== index))
  }

  const canProceed = banks.some((b) => b.trim().length > 0)

  return (
    <motion.div
      key="bank-select"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex min-h-full flex-col px-6 py-10"
    >
      <h1 className="text-balance text-xl font-bold leading-snug text-slate-900">
        Выберите или введите название банка
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
        Укажите банк, из приложения которого сделан скриншот
      </p>

      <datalist id="bank-list">
        {TOP_BANKS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <div className="mt-7 flex flex-col gap-3">
        {banks.map((bank, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              list="bank-list"
              value={bank}
              autoFocus={focusIndexRef.current === i}
              onChange={(e) => updateBank(i, e.target.value)}
              placeholder="Например, Альфа-Банк"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
            />
            {banks.length > 1 && (
              <button
                onClick={() => removeBank(i)}
                aria-label="Удалить банк"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={startAddBank}
        className="mt-3 flex items-center justify-center gap-2 self-start rounded-2xl border border-slate-300 px-4 py-2.5 text-[14px] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" />
        Добавить кэшбек банка
      </button>

      {/* Bottom nav */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[15px] font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="rounded-2xl bg-emerald-600 px-7 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-30"
        >
          Далее
        </button>
      </div>

      {/* Gallery picker shown when adding another bank's cashback */}
      <AnimatePresence>
        {pendingBankIndex !== null && (
          <GalleryScreen
            onCancel={() => setPendingBankIndex(null)}
            onAdd={handleScreenshotAdded}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
