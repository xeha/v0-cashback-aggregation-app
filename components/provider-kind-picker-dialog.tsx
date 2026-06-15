"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Building2, Store, X } from "lucide-react"
import type { ReactNode } from "react"
import type { ProviderSuggestion } from "@/lib/provider-logos"
import type { Kind } from "@/lib/types"

export type ProviderKindPickerMode = "ambiguous" | "unknown"

export interface ProviderKindPickerDialogProps {
  open: boolean
  mode: ProviderKindPickerMode
  providerName: string
  bankMatch?: ProviderSuggestion | null
  marketMatch?: ProviderSuggestion | null
  onSelect: (result: { kind: Kind; slug?: string }) => void
  onCancel: () => void
}

export function ProviderKindPickerDialog({
  open,
  mode,
  providerName,
  bankMatch,
  marketMatch,
  onSelect,
  onCancel,
}: ProviderKindPickerDialogProps) {
  const title = mode === "ambiguous" ? "Уточните источник" : "Уточните тип источника"
  const description =
    mode === "ambiguous"
      ? `«${providerName}» найден и среди банков, и среди супермаркетов`
      : `«${providerName}» не найден в каталоге. Это банк или супермаркет?`

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
            aria-labelledby="provider-kind-picker-title"
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
                  id="provider-kind-picker-title"
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
              {mode === "ambiguous" && bankMatch && marketMatch ? (
                <>
                  <PickerCard
                    label={bankMatch.name}
                    logo={bankMatch.logo}
                    onClick={() =>
                      onSelect({ kind: "bank", slug: bankMatch.slug })
                    }
                  />
                  <PickerCard
                    label={marketMatch.name}
                    logo={marketMatch.logo}
                    onClick={() =>
                      onSelect({ kind: "market", slug: marketMatch.slug })
                    }
                  />
                </>
              ) : (
                <>
                  <PickerCard
                    label="Банк"
                    icon={<Building2 className="h-6 w-6 text-slate-500" />}
                    onClick={() => onSelect({ kind: "bank" })}
                  />
                  <PickerCard
                    label="Супермаркет"
                    icon={<Store className="h-6 w-6 text-slate-500" />}
                    onClick={() => onSelect({ kind: "market" })}
                  />
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PickerCard({
  label,
  logo,
  icon,
  onClick,
}: {
  label: string
  logo?: string
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50"
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          className="h-9 w-9 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
          {icon}
        </span>
      )}
      <span className="text-[15px] font-semibold text-slate-800">{label}</span>
    </button>
  )
}
