"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Download, Share, LayoutGrid } from "lucide-react"
import {
  BANKS,
  CASHBACK_ROWS,
  MARKETS,
  MARKET_CASHBACK_ROWS,
  getCurrentMonthYear,
  getRowTiers,
  type RateTier,
} from "@/lib/cashback-data"
import { AddWidgetOverlay, SavePngOverlay, ShareSheet } from "./results-overlays"

const TIER_STYLES: Record<RateTier, string> = {
  high: "bg-green-100 text-green-700",
  mid: "bg-yellow-100 text-yellow-700",
  low: "bg-red-100 text-red-700",
}

type Tab = "bank" | "market"

export function ResultsScreen({
  onRestart,
  kind = "bank",
}: {
  onRestart: () => void
  kind?: "bank" | "market"
}) {
  const [activeTab, setActiveTab] = useState<Tab>(kind === "market" ? "market" : "bank")
  const [showSave, setShowSave] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showWidget, setShowWidget] = useState(false)

  const providers = activeTab === "market" ? MARKETS : BANKS
  const rows = activeTab === "market" ? MARKET_CASHBACK_ROWS : CASHBACK_ROWS

  function handleSavePng() {
    setShowSave(true)
  }

  function handleShare() {
    setShowShare(true)
  }

  function handleAddWidget() {
    setShowWidget(true)
  }

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex min-h-full flex-col px-5 py-8"
    >
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Ваши кэшбэки</h1>
        <p className="mt-1 text-[14px] capitalize text-slate-500">
          {getCurrentMonthYear()}
        </p>
      </div>

      {/* Segmented tabs */}
      <div className="mb-5 flex rounded-2xl bg-slate-100 p-1">
        {(
          [
            { key: "bank", label: "Банки" },
            { key: "market", label: "Супермаркеты" },
          ] as { key: Tab; label: string }[]
        ).map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="relative flex-1 rounded-xl px-4 py-2 text-[14px] font-semibold transition-colors"
            >
              {isActive && (
                <motion.span
                  layoutId="results-tab-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-white shadow-sm"
                />
              )}
              <span className={`relative z-10 ${isActive ? "text-slate-900" : "text-slate-500"}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Matrix */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        {/* Column headers */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            Категория
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {providers.map((p) => (
              <div key={p.key} className="flex w-11 justify-center">
                <img
                  src={p.logo || "/placeholder.svg"}
                  alt={p.name}
                  title={p.name}
                  className="h-7 w-7 rounded-lg object-cover"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {rows.map((row, idx) => {
          const tiers = getRowTiers(row.rates)
          return (
            <div
              key={row.category}
              className={`flex items-center px-3 py-3 ${
                idx !== rows.length - 1 ? "border-b border-slate-100" : ""
              }`}
            >
              <div className="flex-1 pr-2 text-[13px] font-medium leading-snug text-slate-800">
                {row.category}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {providers.map((p) => {
                  const rate = (row.rates as Record<string, number | undefined>)[p.key]
                  return (
                    <div key={p.key} className="flex w-11 justify-center">
                      {rate !== undefined ? (
                        <span
                          className={`rounded-full px-2 py-1 text-[12px] font-bold ${TIER_STYLES[tiers[p.key]]}`}
                        >
                          {rate}%
                        </span>
                      ) : (
                        <span className="text-[13px] text-slate-300">—</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-green-100 ring-1 ring-green-300" />
          Лучшая ставка
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-yellow-100 ring-1 ring-yellow-300" />
          Средняя
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-100 ring-1 ring-red-300" />
          Меньшая
        </span>
      </div>

      {/* iOS-style action sheet */}
      <div className="mt-auto overflow-hidden rounded-2xl border border-yellow-300 bg-yellow-200 shadow-md">
        <button
          onClick={handleSavePng}
          className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-yellow-300 active:bg-yellow-400"
        >
          <Download className="h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-[15px] font-medium text-slate-900">Сохранить PNG</span>
        </button>
        <div className="h-px bg-yellow-300" />
        <button
          onClick={handleShare}
          className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-yellow-300 active:bg-yellow-400"
        >
          <Share className="h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-[15px] font-medium text-slate-900">Поделиться</span>
        </button>
        <div className="h-px bg-yellow-300" />
        <button
          onClick={handleAddWidget}
          className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-yellow-300 active:bg-yellow-400"
        >
          <LayoutGrid className="h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-[15px] font-medium text-slate-900">Добавить виджет</span>
        </button>
      </div>

      <SavePngOverlay open={showSave} onClose={() => setShowSave(false)} />
      <ShareSheet open={showShare} onClose={() => setShowShare(false)} />
      <AddWidgetOverlay open={showWidget} onClose={() => setShowWidget(false)} tab={activeTab} />
    </motion.div>
  )
}
