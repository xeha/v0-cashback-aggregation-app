"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Plus, X } from "lucide-react"
import { useRef, useState } from "react"
import { ProviderNameInput } from "@/components/provider-name-input"
import { GalleryScreen } from "@/components/screens/gallery-screen"
import { findCatalogMatch } from "@/lib/provider-logos"
import type { Kind, SourceSubmission } from "@/lib/types"

const COPY = {
  bank: {
    title: "Выберите или введите источник кэшбека",
    subtitle: "Укажите, из какого приложения сделан скриншот с кэшбеком",
    placeholder: "Например, Сбер или Т-Банк",
    addLabel: "Ещё кэшбек",
  },
  market: {
    title: "Выберите или введите название супермаркета",
    subtitle: "Укажите супермаркет, из приложения которого сделан скриншот",
    placeholder: "Например, Пятёрочка",
    addLabel: "Добавить кэшбек супермаркета",
  },
} as const

export function BankSelectScreen({
  onBack,
  onNext,
  kind = "bank",
  initialShot = "",
}: {
  onBack: () => void
  onNext: (submissions: SourceSubmission[]) => void
  kind?: Kind
  initialShot?: string
}) {
  const copy = COPY[kind]
  const [banks, setBanks] = useState<string[]>([""])
  const [catalogSlugs, setCatalogSlugs] = useState<(string | null)[]>([null])
  const [shots, setShots] = useState<string[]>([initialShot])
  const [pendingBankIndex, setPendingBankIndex] = useState<number | null>(null)
  const focusIndexRef = useRef<number | null>(null)

  function updateBank(index: number, name: string, slug: string | null) {
    setBanks((prev) => prev.map((b, i) => (i === index ? name : b)))
    setCatalogSlugs((prev) => prev.map((s, i) => (i === index ? slug : s)))
  }

  function startAddBank() {
    setPendingBankIndex(banks.length)
  }

  function handleScreenshotAdded(src: string) {
    const newIndex = banks.length
    setBanks((prev) => [...prev, ""])
    setCatalogSlugs((prev) => [...prev, null])
    setShots((prev) => [...prev, src])
    setPendingBankIndex(null)
    focusIndexRef.current = newIndex
  }

  function removeBank(index: number) {
    setBanks((prev) => prev.filter((_, i) => i !== index))
    setCatalogSlugs((prev) => prev.filter((_, i) => i !== index))
    setShots((prev) => prev.filter((_, i) => i !== index))
  }

  const canProceed = banks.some((b) => b.trim().length > 0)

  function handleNext() {
    const nextSubmissions: SourceSubmission[] = banks
      .map((name, index) => {
        const trimmed = name.trim()
        const pickedSlug = catalogSlugs[index]
        const exactMatch = findCatalogMatch(trimmed, kind)
        return {
          providerName: trimmed,
          screenshotSrc: shots[index] ?? "",
          kind,
          providerSlug: pickedSlug ?? exactMatch?.slug,
        }
      })
      .filter((item) => item.providerName.length > 0 && item.screenshotSrc.length > 0)

    onNext(nextSubmissions)
  }

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
        {copy.title}
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
        {copy.subtitle}
      </p>

      <div className="mt-7 flex flex-col gap-3">
        {banks.map((bank, i) => (
          <div key={i} className="flex items-center gap-2">
            {shots[i] && (
              <img
                src={shots[i] || "/placeholder.svg"}
                alt={`Скриншот ${bank || i + 1}`}
                className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 object-cover"
              />
            )}
            <ProviderNameInput
              value={bank}
              catalogSlug={catalogSlugs[i] ?? null}
              kind={kind}
              autoFocus={focusIndexRef.current === i}
              placeholder={copy.placeholder}
              onChange={(name, slug) => updateBank(i, name, slug)}
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
        {copy.addLabel}
      </button>

      <div className="mt-auto flex items-center justify-between gap-3 pt-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[15px] font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="rounded-2xl bg-yellow-200 px-7 py-3 text-[15px] font-semibold text-slate-900 shadow-sm transition-colors hover:bg-yellow-300 disabled:opacity-30"
        >
          Далее
        </button>
      </div>

      <AnimatePresence>
        {pendingBankIndex !== null && (
          <GalleryScreen
            kind={kind}
            onCancel={() => setPendingBankIndex(null)}
            onAdd={handleScreenshotAdded}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
