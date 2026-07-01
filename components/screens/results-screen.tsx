"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowDownNarrowWide, Bookmark, ChevronDown, ChevronRight, ChevronsUpDown, Download, ImagePlus, Share, Smartphone, Trash2, X } from "lucide-react"
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
import type { CashbackMatrix, Kind, MatrixRow, MatrixState, ProcessingSummary, SourceSubmission } from "@/lib/types"
import { usePwaInstall } from "@/lib/use-pwa-install"
import { getMobilePlatform } from "@/lib/pwa"
import { GuestSaveBanner } from "./guest-save-banner"
import { AddToHomeScreenOverlay, SavePngOverlay, type SavePngStatus } from "./results-overlays"
import { UserMenu } from "./user-menu"
import type { SavedMatrixSummary } from "@/lib/saved-matrices"

const CELL_STYLES: Record<RateTier, string> = {
  high: "bg-green-100 text-green-700 font-bold",
  mid:  "bg-yellow-50 text-yellow-700 font-semibold",
  low:  "bg-red-50 text-red-500 font-semibold",
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
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [canScrollTable, setCanScrollTable] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const [savePngStatus, setSavePngStatus] = useState<SavePngStatus>(null)
  const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null)
  const [showWidget, setShowWidget] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [isCapturing, setIsCapturing] = useState(false)
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

  const sortGroup = sortKey ? groups.find((g) => g.parent === sortKey) : null
  const sortedProviders = sortGroup
    ? [...providers].sort((a, b) => (sortGroup.summaryRates[b.key] ?? -1) - (sortGroup.summaryRates[a.key] ?? -1))
    : providers

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const check = () => setCanScrollTable(el.scrollWidth > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sortedProviders])

  function toggleParent(parent: string) {
    setExpandedParents((prev) => {
      const next = new Set(prev)
      if (next.has(parent)) next.delete(parent)
      else next.add(parent)
      return next
    })
  }

  function handleSavePng() {
    if (savePngStatus === "saving" || isCapturing) return
    setPngPreviewUrl(null)
    setIsCapturing(true)
  }

  useEffect(() => {
    if (!isCapturing) return

    const node = captureRef.current
    if (!node) {
      setIsCapturing(false)
      return
    }

    setSavePngStatus("saving")

    async function doCapture() {
      try {
        await new Promise((resolve) => setTimeout(resolve, 300))
        const { toPng } = await import("html-to-image")
        const dataUrl = await toPng(node!, {
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          filter: (el) => {
            if (el instanceof HTMLElement && el.hasAttribute("data-no-capture")) return false
            if (el instanceof HTMLImageElement) return false
            return true
          },
        })
        if (getMobilePlatform() === "ios") {
          setPngPreviewUrl(dataUrl)
          setSavePngStatus("done")
        } else {
          const link = document.createElement("a")
          const tabSlug = activeTab === "bank" ? "банки" : "супермаркеты"
          link.download = `кешбэки-${tabSlug}-${cashbackPeriodLabel.replace(/\s+/g, "-").toLowerCase()}.png`
          link.href = dataUrl
          link.click()
          setSavePngStatus("done")
          setTimeout(() => setSavePngStatus(null), 2000)
        }
      } catch {
        setSavePngStatus("error")
      } finally {
        setIsCapturing(false)
      }
    }

    void doCapture()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCapturing])

  async function handleShare() {
    const origin = window.location.origin
    const hasBank = (matrix.bank?.providers.length ?? 0) > 0
    const hasMarket = (matrix.market?.providers.length ?? 0) > 0

    if (!hasBank && !hasMarket) {
      setSaveToast("Нечем поделиться — кешбэк не заполнен")
      window.setTimeout(() => setSaveToast(null), 3000)
      return
    }

    const bothExist = activeSaveId && hasBank && hasMarket
    const singleKind = hasBank ? "bank" : "market"

    const bankUrl = activeSaveId ? `${origin}/share/${activeSaveId}?kind=bank` : null
    const marketUrl = activeSaveId ? `${origin}/share/${activeSaveId}?kind=market` : null
    const singleUrl = activeSaveId
      ? `${origin}/share/${activeSaveId}?kind=${singleKind}`
      : window.location.href

    const shareText = bothExist
      ? `Мои кешбэки за ${cashbackPeriodLabel}\n🏦 Банки: ${bankUrl}\n🛒 Маркетплейсы: ${marketUrl}`
      : `Мои кешбэки за ${cashbackPeriodLabel}`

    const clipboardText = bothExist
      ? `Мои кешбэки за ${cashbackPeriodLabel}\n🏦 Банки: ${bankUrl}\n🛒 Маркетплейсы: ${marketUrl}`
      : singleUrl

    if (typeof navigator.share === "function") {
      try {
        if (bothExist) {
          await navigator.share({ title: "CashbackBrain", text: shareText })
        } else {
          await navigator.share({ title: "CashbackBrain", text: shareText, url: singleUrl })
        }
      } catch {
        // пользователь отменил — ничего не делаем
      }
    } else {
      try {
        await navigator.clipboard.writeText(clipboardText)
        setSaveToast("Ссылка скопирована")
        window.setTimeout(() => setSaveToast(null), 3000)
      } catch {
        setSaveToast("Не удалось скопировать ссылку")
        window.setTimeout(() => setSaveToast(null), 3000)
      }
    }
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
      ref={captureRef}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ваши кешбэки</h1>
          <p className="mt-1 text-[14px] capitalize text-slate-500">
            {cashbackPeriodLabel}
          </p>
        </div>
        <div data-no-capture>
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
      </div>

      {showGuestSaveBanner && onLoginRequest && onGuestSaveBannerDismiss && (
        <div data-no-capture>
          <GuestSaveBanner
            onLoginRequest={onLoginRequest}
            onDismiss={onGuestSaveBannerDismiss}
          />
        </div>
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
              onClick={() => { setActiveTab(tab.key); setSortKey(null) }}
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          {/* Баннер активной сортировки */}
          {sortKey ? (
            <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-3 py-2">
              <ArrowDownNarrowWide className="h-4 w-4 shrink-0 text-indigo-500" />
              <span className="flex-1 text-[12px] text-indigo-700">
                Сортировка: <span className="font-semibold">{formatCategoryLabel(sortKey)}</span>
              </span>
              <button
                type="button"
                onClick={() => setSortKey(null)}
                className="rounded-full p-0.5 text-indigo-400 hover:bg-indigo-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
              <span className="text-[11px] text-slate-400">тап по строке — сортировка</span>
              {canScrollTable && <span className="text-[11px] text-slate-400">листайте вправо →</span>}
            </div>
          )}

          {/* Горизонтально-скролируемая таблица */}
          <div ref={tableScrollRef} className={isCapturing ? "overflow-visible" : "overflow-x-auto"}>
            <table className="w-full" style={{ minWidth: isCapturing ? undefined : sortedProviders.length * 52 + 116 }}>
              {/* Шапка с лого */}
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th
                    className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-3 text-left"
                    style={{ width: 116, minWidth: 116 }}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Категория
                    </span>
                  </th>
                  {sortedProviders.map((p) => (
                    <th key={p.key} className="px-1 py-3 text-center" style={{ width: 52, minWidth: 52 }}>
                      <div className="flex justify-center">
                        <ProviderLogo name={p.name} logo={p.logo} seed={p.key} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Строки категорий */}
              <tbody>
                {groups.map((group, groupIdx) => {
                  const visibleRows =
                    activeTab === "market"
                      ? getVisibleMarketGroupRows(group)
                      : getVisibleBankGroupRows(group)
                  const hasSubcategories = groupHasSubcategories(group, activeTab)
                  const isExpanded = hasSubcategories && (expandedParents.has(group.parent) || isCapturing)
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

                  const isSortActive = sortKey === group.parent
                  const tiers = getRowTiers(group.summaryRates)
                  const isEven = groupIdx % 2 === 0

                  return (
                    <Fragment key={group.parent}>
                      {/* Строка группы */}
                      <tr
                        className={
                          isSortActive
                            ? "bg-indigo-50"
                            : isEven
                              ? "bg-white"
                              : "bg-slate-50/40"
                        }
                      >
                        <td
                          className={`sticky left-0 z-10 cursor-pointer border-r px-3 py-2.5 transition-colors active:bg-indigo-100 ${
                            isSortActive
                              ? "border-indigo-200 bg-indigo-50"
                              : isEven
                                ? "border-slate-100 bg-white hover:bg-slate-50"
                                : "border-slate-100 bg-slate-50 hover:bg-slate-100"
                          } ${!isLastGroup || isExpanded ? "border-b border-slate-100" : ""}`}
                          style={{ width: 116, minWidth: 116 }}
                          onClick={() => setSortKey((prev) => (prev === group.parent ? null : group.parent))}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex min-w-0 items-center gap-1">
                              {hasSubcategories && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleParent(group.parent) }}
                                  className="shrink-0"
                                >
                                  {isExpanded
                                    ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                    : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                  }
                                </button>
                              )}
                              <p className={`text-[12px] font-medium leading-snug ${isSortActive ? "text-indigo-700" : "text-slate-700"}`}>
                                {displayLabel}
                              </p>
                            </div>
                            {isSortActive
                              ? <ArrowDownNarrowWide className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                              : <ChevronsUpDown className="h-3 w-3 shrink-0 text-slate-300" />
                            }
                          </div>
                        </td>

                        {sortedProviders.map((p) => {
                          const rate = group.summaryRates[p.key]
                          const tier = tiers[p.key]
                          return (
                            <td key={p.key} className="px-1 py-2.5 text-center" style={{ width: 52, minWidth: 52 }}>
                              {rate !== undefined ? (
                                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[12px] ${CELL_STYLES[tier ?? "mid"]}`}>
                                  {rate}%
                                </span>
                              ) : (
                                <span className="text-[12px] text-slate-300">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Подкатегории */}
                      {isExpanded && visibleRows.map((child, childIdx) => {
                        const childLabel = resolveRowLabel(child)
                        const childTiers = getRowTiers(child.rates)
                        const isLastChild = childIdx === visibleRows.length - 1
                        return (
                          <tr
                            key={`${child.referenceNodeId ?? child.category}-${child.referenceDepth ?? 0}`}
                            className="bg-indigo-50/30"
                          >
                            <td
                              className={`sticky left-0 z-10 border-r border-slate-100 bg-indigo-50/40 py-2 pl-7 pr-3 ${
                                !isLastChild || !isLastGroup ? "border-b border-slate-100" : ""
                              }`}
                              style={{ width: 116, minWidth: 116 }}
                            >
                              <p className="text-[11px] leading-snug text-slate-500">{childLabel}</p>
                            </td>
                            {sortedProviders.map((p) => {
                              const range = child.rateRanges?.[p.key]
                              const rate = child.rates[p.key]
                              const label = range
                                ? range.min === range.max ? `${range.max}%` : `${range.min}–${range.max}%`
                                : rate !== undefined ? `${rate}%` : undefined
                              const childTier = childTiers[p.key]
                              return (
                                <td
                                  key={p.key}
                                  className={`px-1 py-2 text-center ${!isLastChild || !isLastGroup ? "border-b border-slate-100" : ""}`}
                                  style={{ width: 52, minWidth: 52 }}
                                >
                                  {label !== undefined ? (
                                    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] ${CELL_STYLES[childTier ?? "mid"]}`}>
                                      {label}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-300">—</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
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

      <div data-no-capture className="mt-auto overflow-hidden rounded-2xl border border-yellow-300 bg-yellow-200 shadow-md">
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
        data-no-capture
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

      <div data-no-capture>
        <SavePngOverlay
          status={savePngStatus}
          previewUrl={pngPreviewUrl}
          onClose={() => { setSavePngStatus(null); setPngPreviewUrl(null) }}
        />
      </div>
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
