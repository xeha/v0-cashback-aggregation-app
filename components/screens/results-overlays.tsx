"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Loader2, Mail, Link2, MessageCircle, Send, X } from "lucide-react"
import {
  BANKS,
  CASHBACK_ROWS,
  MARKETS,
  MARKET_CASHBACK_ROWS,
  getRowTiers,
  type RateTier,
} from "@/lib/cashback-data"

type Tab = "bank" | "market"

const TIER_STYLES: Record<RateTier, string> = {
  high: "bg-green-100 text-green-700",
  mid: "bg-yellow-100 text-yellow-700",
  low: "bg-red-100 text-red-700",
}

/* ------------------------------------------------------------------ */
/* Save PNG overlay: spinner -> green check                            */
/* ------------------------------------------------------------------ */

export function SavePngOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setDone(false)
    const doneTimer = setTimeout(() => setDone(true), 1600)
    const closeTimer = setTimeout(onClose, 3000)
    return () => {
      clearTimeout(doneTimer)
      clearTimeout(closeTimer)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex w-44 flex-col items-center gap-4 rounded-3xl bg-white px-6 py-7 shadow-xl"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatePresence mode="wait">
              {!done ? (
                <motion.div key="spinner" exit={{ opacity: 0 }}>
                  <Loader2 className="h-12 w-12 animate-spin text-slate-400" />
                </motion.div>
              ) : (
                <motion.div
                  key="check"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
                >
                  <Check className="h-7 w-7 text-green-600" strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
            <p className="text-center text-[14px] font-medium text-slate-700">
              {done ? "Сохранено в галерею" : "Сохраняем…"}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Share bottom sheet                                                  */
/* ------------------------------------------------------------------ */

const SHARE_TARGETS = [
  { key: "telegram", label: "Telegram", icon: Send, bg: "bg-sky-500" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, bg: "bg-green-500" },
  { key: "email", label: "Почта", icon: Mail, bg: "bg-slate-500" },
  { key: "copy", label: "Копировать", icon: Link2, bg: "bg-slate-700" },
]

export function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="rounded-t-3xl bg-white px-5 pb-8 pt-3"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-slate-900">Поделиться</h2>
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {SHARE_TARGETS.map((t) => (
                <button
                  key={t.key}
                  onClick={onClose}
                  className="flex flex-col items-center gap-2"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white ${t.bg}`}
                  >
                    <t.icon className="h-6 w-6" />
                  </span>
                  <span className="text-[12px] font-medium text-slate-600">{t.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Add widget overlay: phone home screen with animated widget          */
/* ------------------------------------------------------------------ */

function WidgetCard({ tab }: { tab: Tab }) {
  const providers = tab === "market" ? MARKETS : BANKS
  const rows = (tab === "market" ? MARKET_CASHBACK_ROWS : CASHBACK_ROWS).slice(0, 4)

  return (
    <div className="rounded-3xl bg-white/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[12px] font-bold text-slate-900">Кэшбэки</span>
        <div className="flex items-center gap-1">
          {providers.map((p) => (
            <img
              key={p.key}
              src={p.logo || "/placeholder.svg"}
              alt={p.name}
              className="h-4 w-4 rounded-md object-cover"
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const tiers = getRowTiers(row.rates)
          return (
            <div key={row.category} className="flex items-center">
              <span className="flex-1 truncate pr-1 text-[10px] font-medium text-slate-700">
                {row.category}
              </span>
              <div className="flex items-center gap-0.5">
                {providers.map((p) => {
                  const rate = (row.rates as Record<string, number | undefined>)[p.key]
                  return (
                    <span key={p.key} className="flex w-7 justify-center">
                      {rate !== undefined ? (
                        <span
                          className={`rounded-full px-1 py-0.5 text-[9px] font-bold ${TIER_STYLES[tiers[p.key]]}`}
                        >
                          {rate}%
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-300">—</span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DOCK_APPS = ["bg-green-500", "bg-sky-500", "bg-orange-500", "bg-slate-700"]

export function AddWidgetOverlay({
  open,
  onClose,
  tab,
}: {
  open: boolean
  onClose: () => void
  tab: Tab
}) {
  const [placed, setPlaced] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlaced(false)
    const t = setTimeout(() => setPlaced(true), 500)
    return () => clearTimeout(t)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-5 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative flex h-full max-h-[560px] w-full max-w-[300px] flex-col overflow-hidden rounded-[2.5rem] border-4 border-slate-800 bg-gradient-to-b from-sky-400 via-indigo-400 to-purple-500 p-5 shadow-2xl"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Status bar */}
            <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-white">
              <span>9:41</span>
              <span>Домой</span>
            </div>

            {/* Clock-ish heading */}
            <p className="mb-4 text-center text-[13px] font-medium text-white/90">
              {placed ? "Виджет добавлен" : "Добавляем виджет…"}
            </p>

            {/* Widget drop zone */}
            <div className="flex flex-1 items-start justify-center">
              <AnimatePresence>
                {placed && (
                  <motion.div
                    className="w-full"
                    initial={{ y: -40, scale: 0.6, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  >
                    <WidgetCard tab={tab} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* App grid */}
            <div className="mb-4 grid grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-white/25" />
              ))}
            </div>

            {/* Dock */}
            <div className="flex items-center justify-around rounded-3xl bg-white/25 p-2">
              {DOCK_APPS.map((bg, i) => (
                <div key={i} className={`h-11 w-11 rounded-2xl ${bg}`} />
              ))}
            </div>

            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
