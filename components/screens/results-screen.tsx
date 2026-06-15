"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Download, Share, LayoutGrid, ImagePlus, Trash2 } from "lucide-react"
import { ProviderLogo } from "@/components/provider-logo"
import { getCurrentMonthYear, getRowTiers, type RateTier } from "@/lib/cashback-data"
import type { CashbackMatrix, Kind, MatrixState } from "@/lib/types"
import { AddWidgetOverlay, SavePngOverlay, ShareSheet } from "./results-overlays"
import { UserMenu } from "./user-menu"

const TIER_STYLES: Record<RateTier, string> = {
  high: "bg-green-100 text-green-700",
  mid: "bg-yellow-100 text-yellow-700",
  low: "bg-red-100 text-red-700",
}

type Tab = "bank" | "market"

function getActiveMatrix(matrix: MatrixState, tab: Tab): CashbackMatrix | null {
  return tab === "market" ? matrix.market : matrix.bank
}

export function ResultsScreen({
  onRestart,
  onUploadMore,
  kind = "bank",
  matrix,
}: {
  onRestart: () => void
  onUploadMore: () => void
  kind?: Kind
  matrix: MatrixState
}) {
  const [activeTab, setActiveTab] = useState<Tab>(kind === "market" ? "market" : "bank")
  const [showSave, setShowSave] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showWidget, setShowWidget] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const activeMatrix = getActiveMatrix(matrix, activeTab)
  const providers = activeMatrix?.providers ?? []
  const rows = activeMatrix?.rows ?? []

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
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ваши кэшбэки</h1>
          <p className="mt-1 text-[14px] capitalize text-slate-500">
            {getCurrentMonthYear()}
          </p>
        </div>
        <UserMenu onLogout={onRestart} />
      </div>

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

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <p className="text-[15px] font-medium text-slate-700">Нет данных для этой вкладки</p>
          <p className="mt-2 text-[14px] text-slate-500">
            Загрузите скриншоты и дождитесь распознавания, чтобы увидеть матрицу.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Категория
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {providers.map((p) => (
                <div key={p.key} className="flex w-11 justify-center">
                  <ProviderLogo name={p.name} logo={p.logo} seed={p.key} />
                </div>
              ))}
            </div>
          </div>

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
                    const rate = row.rates[p.key]
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
      )}

      <div className="mt-4 mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-500">
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
        <div className="h-px bg-yellow-300" />
        <button
          onClick={onUploadMore}
          className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-yellow-300 active:bg-yellow-400"
        >
          <ImagePlus className="h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-[15px] font-medium text-slate-900">Загрузить ещё</span>
        </button>
      </div>

      <button
        onClick={() => setShowResetConfirm(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 px-5 py-3.5 text-[15px] font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        Очистить данные
      </button>

      <SavePngOverlay open={showSave} onClose={() => setShowSave(false)} />
      <ShareSheet open={showShare} onClose={() => setShowShare(false)} />
      <AddWidgetOverlay open={showWidget} onClose={() => setShowWidget(false)} tab={activeTab} />

      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-slate-900/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(false)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reset-title"
              aria-describedby="reset-desc"
              className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              <h2 id="reset-title" className="text-lg font-bold text-slate-900">
                Очистить все данные?
              </h2>
              <p id="reset-desc" className="mt-2 text-[14px] leading-relaxed text-slate-500">
                Все сохранённые категории кэшбэка будут удалены без возможности восстановления. Вы
                уверены, что хотите начать заново?
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowResetConfirm(false)
                    onRestart()
                  }}
                  className="w-full rounded-2xl bg-red-600 px-5 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800"
                >
                  Очистить
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full rounded-2xl bg-slate-100 px-5 py-3.5 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 active:bg-slate-300"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
