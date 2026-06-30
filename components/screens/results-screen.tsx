"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, Download, Share, Smartphone, ImagePlus, Trash2, Bookmark } from "lucide-react"
import { ProviderLogo } from "@/components/provider-logo"
import { ProcessingWarningsBanner } from "@/components/processing-warnings-banner"
import { getRowTiers, type RateTier } from "@/lib/cashback-data"
import {
  groupMatrixRows,
  groupHasSubcategories,
  countProvidersInGroup,
  resolveMarketRowCategory,
  getMarketGroupDisplayLabel,
  getVisibleBankGroupRows,
  getVisibleMarketGroupRows,
} from "@/lib/matrix"
import {
  formatCategoryLabel,
  labelsEquivalent,
} from "@/lib/category-label"
import type { CashbackMatrix, Kind, MatrixProvider, MatrixRow, MatrixState, ProcessingSummary, SourceSubmission } from "@/lib/types"
import { usePwaInstall } from "@/lib/use-pwa-install"
import { GuestSaveBanner } from "./guest-save-banner"
import { AddToHomeScreenOverlay, SavePngOverlay, ShareSheet } from "./results-overlays"
import { UserMenu } from "./user-menu"
import type { SavedMatrixSummary } from "@/lib/saved-matrices"

const TIER_STYLES: Record<RateTier, string> = {
  high: "bg-green-100 text-green-700",
  mid: "bg-yellow-100 text-yellow-700",
  low: "bg-red-100 text-red-700",
}

type Tab = "bank" | "market"

function getActiveMatrix(matrix: MatrixState, tab: Tab): CashbackMatrix | null {
  return tab === "market" ? matrix.market : matrix.bank
}

function getDefaultTab(matrix: MatrixState, kind: Kind): Tab {
  if (matrix.bank) return "bank"
  if (matrix.market) return "market"
  return kind === "market" ? "market" : "bank"
}

function RateBadges({
  rates,
  rateRanges,
  providers,
}: {
  rates: Record<string, number>
  rateRanges?: MatrixRow["rateRanges"]
  providers: MatrixProvider[]
}) {
  const tiers = getRowTiers(rates)
  return (
    <div className="flex shrink-0 items-center gap-1">
      {providers.map((p) => {
        const range = rateRanges?.[p.key]
        const rate = rates[p.key]
        const label =
          range !== undefined
            ? range.min === range.max
              ? `${range.max}%`
              : `${range.min}–${range.max}%`
            : rate !== undefined
              ? `${rate}%`
              : undefined
        return (
          <div key={p.key} className="flex w-11 justify-center">
            {label !== undefined ? (
              <span
                className={`rounded-full px-2 py-1 text-[12px] font-bold ${TIER_STYLES[tiers[p.key] ?? "mid"]}`}
              >
                {label}
              </span>
            ) : (
              <span className="text-[13px] text-slate-300">—</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MatrixRowContent({
  row,
  providers,
  indented = false,
  displayCategory,
}: {
  row: MatrixRow
  providers: MatrixProvider[]
  indented?: boolean
  displayCategory?: string
}) {
  const categoryLabel = displayCategory ?? row.category
  const showParent =
    row.parent &&
    !indented &&
    !row.isMacro &&
    !labelsEquivalent(categoryLabel, row.parent)
  const showBankRaw =
    row.bankRaw &&
    !labelsEquivalent(row.bankRaw, categoryLabel) &&
    !(row.parent && labelsEquivalent(row.bankRaw, row.parent))

  return (
    <>
      <div className={`flex-1 pr-2 ${indented ? "pl-6" : ""}`}>
        <p className="text-[13px] font-medium leading-snug text-slate-800">{categoryLabel}</p>
        {showParent && row.parent ? (
          <p className="text-[11px] text-slate-400">{formatCategoryLabel(row.parent)}</p>
        ) : null}
        {showBankRaw && <p className="text-[11px] text-slate-400">{row.bankRaw}</p>}
      </div>
      <RateBadges rates={row.rates} rateRanges={row.rateRanges} providers={providers} />
    </>
  )
}

export function ResultsScreen({
  onRestart,
  onLogout,
  onUploadMore,
  onLoginRequest,
  onSaveMatrix,
  cashbackPeriodLabel,
  kind = "bank",
  matrix,
  submissions = [],
  processingSummary = { skipped: [], lowConfidence: [], bankOffers: [] },
  userEmail,
  isGuest = false,
  showGuestSaveBanner = false,
  onGuestSaveBannerDismiss,
  activeSaveId = null,
  savedSummaries = [],
  savesLoading = false,
  savesError = null,
  onOpenSaved,
  onDeleteSaved,
  onNewAssembly,
  onRetrySaves,
}: {
  onRestart: () => void
  onLogout: () => void
  onUploadMore: () => void
  onLoginRequest?: () => void
  onSaveMatrix?: () => Promise<{ ok: true; message: string } | { ok: false; message: string }>
  cashbackPeriodLabel: string
  kind?: Kind
  matrix: MatrixState
  submissions?: SourceSubmission[]
  processingSummary?: ProcessingSummary
  userEmail?: string
  isGuest?: boolean
  showGuestSaveBanner?: boolean
  onGuestSaveBannerDismiss?: () => void
  activeSaveId?: string | null
  savedSummaries?: SavedMatrixSummary[]
  savesLoading?: boolean
  savesError?: string | null
  onOpenSaved?: (id: string) => void
  onDeleteSaved?: (id: string) => void
  onNewAssembly?: () => void
  onRetrySaves?: () => void
}) {
  const [activeTab, setActiveTab] = useState<Tab>(() => getDefaultTab(matrix, kind))
  const [showSave, setShowSave] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showWidget, setShowWidget] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [isSavingMatrix, setIsSavingMatrix] = useState(false)
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { isStandalone, canPromptInstall, promptInstall } = usePwaInstall()

  const activeMatrix = getActiveMatrix(matrix, activeTab)
  const providers = activeMatrix?.providers ?? []
  const rows = activeMatrix?.rows ?? []
  const marketParts = activeTab === "market" ? activeMatrix?.marketParts : undefined
  const groups = activeMatrix?.groups ?? groupMatrixRows(rows, marketParts)
  const hasMatrixData = groups.length > 0

  function toggleParent(parent: string) {
    setExpandedParents((prev) => {
      const next = new Set(prev)
      if (next.has(parent)) next.delete(parent)
      else next.add(parent)
      return next
    })
  }

  function handleSavePng() {
    setShowSave(true)
  }

  function handleShare() {
    setShowShare(true)
  }

  async function handleAddToHomeScreen() {
    if (isStandalone) {
      setShowWidget(true)
      return
    }

    if (canPromptInstall) {
      const accepted = await promptInstall()
      if (accepted) return
    }

    setShowWidget(true)
  }

  async function handleSaveMatrix() {
    if (!onSaveMatrix) return

    setSaveError(null)
    setIsSavingMatrix(true)

    try {
      const result = await onSaveMatrix()
      if (result.ok) {
        setSaveToast(result.message)
        window.setTimeout(() => setSaveToast(null), 3000)
      } else {
        setSaveError(result.message)
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить")
    } finally {
      setIsSavingMatrix(false)
    }
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
          <h1 className="text-2xl font-bold text-slate-900">Ваши кешбэки</h1>
          <p className="mt-1 text-[14px] capitalize text-slate-500">
            {cashbackPeriodLabel}
          </p>
        </div>
        <UserMenu
          onLogout={onLogout}
          onLoginRequest={onLoginRequest}
          isGuest={isGuest}
          userEmail={userEmail}
          savedSummaries={savedSummaries}
          savesLoading={savesLoading}
          savesError={savesError}
          onOpenSaved={onOpenSaved}
          onDeleteSaved={onDeleteSaved}
          onNewAssembly={onNewAssembly}
          onRetrySaves={onRetrySaves}
          matrix={matrix}
        />
      </div>

      {showGuestSaveBanner && onLoginRequest && onGuestSaveBannerDismiss && (
        <GuestSaveBanner
          onLoginRequest={onLoginRequest}
          onDismiss={onGuestSaveBannerDismiss}
        />
      )}

      <ProcessingWarningsBanner summary={processingSummary} />

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

      {!hasMatrixData ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <p className="text-[15px] font-medium text-slate-700">Нет данных для этой вкладки</p>
          <p className="mt-2 text-[14px] text-slate-500">
            Загрузите скриншоты и дождитесь распознавания, чтобы увидеть матрицу.
          </p>
        </div>
      ) : (
        <>
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

            {groups.map((group, groupIdx) => {
              const visibleRows =
                activeTab === "market"
                  ? getVisibleMarketGroupRows(group)
                  : getVisibleBankGroupRows(group)
              const hasSubcategories = groupHasSubcategories(group, activeTab)
              const isExpanded = hasSubcategories && expandedParents.has(group.parent)
              const isLastGroup = groupIdx === groups.length - 1
              const providerCountInGroup = activeTab === "market" ? countProvidersInGroup(group) : 0
              const resolveRowLabel = (row: MatrixRow) =>
                activeTab === "market"
                  ? resolveMarketRowCategory(row, providerCountInGroup)
                  : row.category
              const groupHeaderLabel = getMarketGroupDisplayLabel(group)
              const displayLabel = hasSubcategories
                ? formatCategoryLabel(groupHeaderLabel)
                : formatCategoryLabel(
                    group.rows[0] ? resolveRowLabel(group.rows[0]) : groupHeaderLabel,
                  )

              if (!hasSubcategories) {
                const row = group.rows[0]
                const rowLabel = row ? resolveRowLabel(row) : displayLabel
                const showBankRaw =
                  row?.bankRaw &&
                  !labelsEquivalent(row.bankRaw, rowLabel) &&
                  !(row.parent && labelsEquivalent(row.bankRaw, row.parent))

                return (
                  <div
                    key={group.parent}
                    className={`flex items-center px-3 py-3 ${
                      !isLastGroup ? "border-b border-slate-100" : ""
                    }`}
                  >
                    <div className="flex-1 pr-2">
                      <p className="text-[13px] font-semibold leading-snug text-slate-800">
                        {rowLabel}
                      </p>
                      {showBankRaw ? (
                        <p className="text-[11px] text-slate-400">{row.bankRaw}</p>
                      ) : null}
                    </div>
                    <RateBadges rates={group.summaryRates} providers={providers} />
                  </div>
                )
              }

              return (
                <div
                  key={group.parent}
                  className={!isLastGroup && !isExpanded ? "border-b border-slate-100" : ""}
                >
                  <button
                    type="button"
                    onClick={() => toggleParent(group.parent)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center px-3 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex flex-1 items-center gap-1.5 pr-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <span className="text-[13px] font-semibold leading-snug text-slate-800">
                        {displayLabel}
                      </span>
                    </div>
                    <RateBadges rates={group.summaryRates} providers={providers} />
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        {visibleRows.map((child) => (
                          <div
                            key={`${child.referenceNodeId ?? child.category}-${child.referenceDepth ?? 0}`}
                            className="flex items-center border-t border-slate-100 bg-slate-50/50 px-3 py-2.5"
                          >
                            <MatrixRowContent
                              row={child}
                              providers={providers}
                              indented
                              displayCategory={resolveRowLabel(child)}
                            />
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </>
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
        {!isGuest && onSaveMatrix && (
          <>
        <button
          type="button"
          onClick={handleSaveMatrix}
          disabled={isSavingMatrix || !hasMatrixData}
          className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-yellow-300 active:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Bookmark className="h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-[15px] font-medium text-slate-900">
            {isSavingMatrix
              ? "Сохранение…"
              : activeSaveId
                ? "Сохранить изменения"
                : "Сохранить результат"}
          </span>
        </button>
        <div className="h-px bg-yellow-300" />
          </>
        )}
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
          type="button"
          onClick={() => void handleAddToHomeScreen()}
          className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-yellow-300 active:bg-yellow-400"
        >
          <Smartphone className="h-5 w-5 shrink-0 text-slate-700" />
          <span className="text-[15px] font-medium text-slate-900">На экран «Домой»</span>
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

      {saveError && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {saveError}
        </p>
      )}

      <SavePngOverlay open={showSave} onClose={() => setShowSave(false)} />
      <ShareSheet open={showShare} onClose={() => setShowShare(false)} />
      <AddToHomeScreenOverlay
        open={showWidget}
        onClose={() => setShowWidget(false)}
        canPromptInstall={canPromptInstall}
        onInstall={promptInstall}
        isStandalone={isStandalone}
      />

      <AnimatePresence>
        {saveToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="pointer-events-none absolute inset-x-5 bottom-6 z-40 rounded-2xl bg-slate-900 px-4 py-3 text-center text-[14px] font-medium text-white shadow-lg"
          >
            {saveToast}
          </motion.div>
        )}
      </AnimatePresence>

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
                Все сохранённые категории кешбэка будут удалены без возможности восстановления. Вы
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
