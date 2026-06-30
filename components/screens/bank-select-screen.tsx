"use client"

import { motion } from "framer-motion"
import { ArrowLeft, Plus, X } from "lucide-react"
import { useRef, useState } from "react"
import { DuplicateSourceConfirmDialog } from "@/components/duplicate-source-confirm-dialog"
import {
  ProviderKindPickerDialog,
  type ProviderKindPickerMode,
} from "@/components/provider-kind-picker-dialog"
import { ProviderNameInput } from "@/components/provider-name-input"
import {
  ScreenshotReuseConfirmDialog,
  type ScreenshotReuseConflict,
} from "@/components/screenshot-reuse-confirm-dialog"
import { ImageFilePicker } from "@/components/image-file-picker"
import {
  buildBankSelectRowState,
  canProceedBankSelect,
  type BankSelectInitialRow,
} from "@/lib/bank-select-rows"
import {
  formatFileModifiedDate,
  getCashbackPeriodOptions,
  optionValueToPeriod,
  periodToOptionValue,
} from "@/lib/cashback-period"
import {
  findCatalogMatches,
  getProviderComparisonKey,
  providerNamesMatch,
  type ProviderSuggestion,
} from "@/lib/provider-logos"
import type {
  CashbackPeriod,
  ImagePickResult,
  Kind,
  SourceSubmission,
} from "@/lib/types"

const COPY = {
  title: "Выберите или введите источник кешбэка",
  subtitle: "Укажите, из какого приложения сделан скриншот — банка или супермаркета",
  placeholder: "Например, Сбер или Пятёрочка",
  addLabel: "Ещё кешбэк",
} as const

interface ResolutionTask {
  rowIndex: number
  providerName: string
  screenshotSrc: string
  mode: ProviderKindPickerMode
  bankMatch?: ProviderSuggestion
  marketMatch?: ProviderSuggestion
}

interface ResolveContext {
  tasks: ResolutionTask[]
  taskIndex: number
  submissionsByIndex: Map<number, SourceSubmission>
}

interface DuplicateConfirmState {
  providerNames: string[]
  submissionsByIndex: Map<number, SourceSubmission>
}

interface ScreenshotReuseBlockState {
  conflicts: ScreenshotReuseConflict[]
  conflictRowIndices: number[]
}

interface SubmissionRow {
  rowIndex: number
  providerName: string
  screenshotSrc: string
  kind: Kind
}

function getScreenshotReuseConflicts(rows: SubmissionRow[]): ScreenshotReuseBlockState {
  const seenBySrc = new Map<string, { name: string; rowIndex: number; kind: Kind }>()
  const conflicts: ScreenshotReuseConflict[] = []
  const conflictRowIndices = new Set<number>()
  const conflictKeys = new Set<string>()

  for (const { rowIndex, providerName, screenshotSrc, kind } of rows) {
    const name = providerName.trim()
    if (!screenshotSrc || !name) continue

    const first = seenBySrc.get(screenshotSrc)
    if (!first) {
      seenBySrc.set(screenshotSrc, { name, rowIndex, kind })
      continue
    }

    if (providerNamesMatch(first.name, name, kind)) continue

    const key = `${screenshotSrc}:${getProviderComparisonKey(name, kind)}`
    if (!conflictKeys.has(key)) {
      conflictKeys.add(key)
      conflicts.push({ originalProviderName: first.name, newProviderName: name })
    }

    conflictRowIndices.add(first.rowIndex)
    conflictRowIndices.add(rowIndex)
  }

  return { conflicts, conflictRowIndices: [...conflictRowIndices] }
}

function getDuplicateProviderNames(
  submissions: Array<{ providerName: string; kind: Kind }>,
): string[] {
  const seen = new Map<string, string>()
  const duplicates = new Set<string>()

  for (const { providerName, kind } of submissions) {
    const trimmed = providerName.trim()
    if (!trimmed) continue

    const comparisonKey = getProviderComparisonKey(trimmed, kind)
    const existing = seen.get(comparisonKey)
    if (existing) {
      duplicates.add(existing)
      continue
    }

    seen.set(comparisonKey, trimmed)
  }

  return [...duplicates].sort((a, b) => a.localeCompare(b, "ru"))
}

function resolveInitialFileModifiedAts(
  fileModifiedAts: (string | null)[],
  shots: string[],
  fileModifiedBySrc?: Record<string, number>,
): (string | null)[] {
  if (!fileModifiedBySrc) return fileModifiedAts

  return fileModifiedAts.map((existing, i) => {
    if (existing) return existing
    const src = shots[i]
    if (!src) return null
    const ms = fileModifiedBySrc[src]
    if (ms == null) return null
    if (!formatFileModifiedDate(ms)) return null
    return new Date(ms).toISOString()
  })
}

function getFileDateLabel(
  rowIndex: number,
  fileModifiedAts: (string | null)[],
  shots: string[],
  fileModifiedBySrc?: Record<string, number>,
): string | null {
  const iso = fileModifiedAts[rowIndex]
  if (iso) {
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) {
      const label = formatFileModifiedDate(ms)
      if (label) return label
    }
  }

  const src = shots[rowIndex]
  if (src && fileModifiedBySrc?.[src] != null) {
    return formatFileModifiedDate(fileModifiedBySrc[src])
  }

  return null
}

export function BankSelectScreen({
  onBack,
  onNext,
  kind = "bank",
  initialShot = "",
  initialRows,
  lockedRowCount = 0,
  cashbackPeriod,
  onCashbackPeriodChange,
  fileModifiedBySrc,
  onScreenshotPicked,
}: {
  onBack: () => void
  onNext: (submissions: SourceSubmission[]) => void
  kind?: Kind
  initialShot?: string
  initialRows?: BankSelectInitialRow[]
  lockedRowCount?: number
  cashbackPeriod: CashbackPeriod
  onCashbackPeriodChange: (period: CashbackPeriod) => void
  fileModifiedBySrc?: Record<string, number>
  onScreenshotPicked?: (result: ImagePickResult) => void
}) {
  const initial = buildBankSelectRowState(initialRows, initialShot)
  const [names, setNames] = useState<string[]>(initial.names)
  const [catalogSlugs, setCatalogSlugs] = useState<(string | null)[]>(initial.catalogSlugs)
  const [rowKinds, setRowKinds] = useState<(Kind | null)[]>(initial.rowKinds)
  const [shots, setShots] = useState<string[]>(initial.shots)
  const [fileModifiedAts, setFileModifiedAts] = useState<(string | null)[]>(() =>
    resolveInitialFileModifiedAts(initial.fileModifiedAts, initial.shots, fileModifiedBySrc),
  )
  const [resolveContext, setResolveContext] = useState<ResolveContext | null>(null)
  const [duplicateConfirm, setDuplicateConfirm] = useState<DuplicateConfirmState | null>(null)
  const [screenshotReuseBlock, setScreenshotReuseBlock] =
    useState<ScreenshotReuseBlockState | null>(null)
  const [screenshotReuseDialogOpen, setScreenshotReuseDialogOpen] = useState(false)
  const focusIndexRef = useRef<number | null>(null)

  function clearScreenshotReuseBlock() {
    setScreenshotReuseBlock(null)
    setScreenshotReuseDialogOpen(false)
  }

  function updateRow(
    index: number,
    name: string,
    slug: string | null,
    rowKind: Kind | null,
  ) {
    if (index < lockedRowCount) return
    clearScreenshotReuseBlock()
    setNames((prev) => prev.map((value, i) => (i === index ? name : value)))
    setCatalogSlugs((prev) => prev.map((value, i) => (i === index ? slug : value)))
    setRowKinds((prev) => prev.map((value, i) => (i === index ? rowKind : value)))
  }

  function handleScreenshotAdded(result: ImagePickResult) {
    const newIndex = names.length
    const fileDateLabel = formatFileModifiedDate(result.fileModifiedAt)
    const fileModifiedAt = fileDateLabel
      ? new Date(result.fileModifiedAt).toISOString()
      : null

    setNames((prev) => [...prev, ""])
    setCatalogSlugs((prev) => [...prev, null])
    setRowKinds((prev) => [...prev, null])
    setShots((prev) => [...prev, result.dataUrl])
    setFileModifiedAts((prev) => [...prev, fileModifiedAt])
    focusIndexRef.current = newIndex
    onScreenshotPicked?.(result)
  }

  function removeRow(index: number) {
    if (index < lockedRowCount) return
    clearScreenshotReuseBlock()

    if (names.length <= 1) {
      onBack()
      return
    }

    setNames((prev) => prev.filter((_, i) => i !== index))
    setCatalogSlugs((prev) => prev.filter((_, i) => i !== index))
    setRowKinds((prev) => prev.filter((_, i) => i !== index))
    setShots((prev) => prev.filter((_, i) => i !== index))
    setFileModifiedAts((prev) => prev.filter((_, i) => i !== index))
  }

  const canProceed = canProceedBankSelect(names, shots)

  function buildSubmission(
    rowIndex: number,
    providerName: string,
    rowKind: Kind,
    providerSlug?: string,
  ): SourceSubmission {
    const fileModifiedAt = fileModifiedAts[rowIndex]
    return {
      providerName,
      screenshotSrc: shots[rowIndex] ?? "",
      kind: rowKind,
      providerSlug,
      ...(fileModifiedAt ? { fileModifiedAt } : {}),
    }
  }

  function finishWithSubmissions(submissionsByIndex: Map<number, SourceSubmission>) {
    const rows = [...submissionsByIndex.entries()].map(([rowIndex, submission]) => ({
      rowIndex,
      providerName: submission.providerName,
      screenshotSrc: submission.screenshotSrc,
      kind: submission.kind,
    }))

    const screenshotBlock = getScreenshotReuseConflicts(rows)
    if (screenshotBlock.conflicts.length > 0) {
      setScreenshotReuseBlock(screenshotBlock)
      setScreenshotReuseDialogOpen(true)
      return
    }

    clearScreenshotReuseBlock()
    proceedToDuplicateNameCheck(submissionsByIndex)
  }

  function proceedToDuplicateNameCheck(
    submissionsByIndex: Map<number, SourceSubmission>,
  ) {
    const ordered = [...submissionsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, submission]) => submission)

    const duplicateNames = getDuplicateProviderNames(ordered)

    if (duplicateNames.length > 0) {
      setDuplicateConfirm({ providerNames: duplicateNames, submissionsByIndex })
      return
    }

    onNext(ordered)
  }

  function handleDuplicateConfirm() {
    if (!duplicateConfirm) return

    const ordered = [...duplicateConfirm.submissionsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, submission]) => submission)

    setDuplicateConfirm(null)
    onNext(ordered)
  }

  function handleDuplicateCancel() {
    setDuplicateConfirm(null)
  }

  function handleNext() {
    const submissionsByIndex = new Map<number, SourceSubmission>()
    const tasks: ResolutionTask[] = []

    names.forEach((name, index) => {
      const trimmed = name.trim()
      const screenshotSrc = shots[index] ?? ""
      if (!trimmed || !screenshotSrc) return

      const pickedKind = rowKinds[index]
      const pickedSlug = catalogSlugs[index]

      if (pickedKind) {
        submissionsByIndex.set(
          index,
          buildSubmission(
            index,
            trimmed,
            pickedKind,
            pickedSlug ?? undefined,
          ),
        )
        return
      }

      const matches = findCatalogMatches(trimmed)

      if (matches.bank && matches.market) {
        tasks.push({
          rowIndex: index,
          providerName: trimmed,
          screenshotSrc,
          mode: "ambiguous",
          bankMatch: matches.bank,
          marketMatch: matches.market,
        })
        return
      }

      if (matches.bank) {
        submissionsByIndex.set(
          index,
          buildSubmission(index, trimmed, "bank", matches.bank.slug),
        )
        return
      }

      if (matches.market) {
        submissionsByIndex.set(
          index,
          buildSubmission(index, trimmed, "market", matches.market.slug),
        )
        return
      }

      tasks.push({
        rowIndex: index,
        providerName: trimmed,
        screenshotSrc,
        mode: "unknown",
      })
    })

    if (tasks.length === 0) {
      finishWithSubmissions(submissionsByIndex)
      return
    }

    setResolveContext({
      tasks,
      taskIndex: 0,
      submissionsByIndex,
    })
  }

  function handlePickerSelect(result: { kind: Kind; slug?: string }) {
    if (!resolveContext) return

    const task = resolveContext.tasks[resolveContext.taskIndex]
    const nextSubmissions = new Map(resolveContext.submissionsByIndex)
    nextSubmissions.set(
      task.rowIndex,
      buildSubmission(task.rowIndex, task.providerName, result.kind, result.slug),
    )

    const nextTaskIndex = resolveContext.taskIndex + 1
    if (nextTaskIndex >= resolveContext.tasks.length) {
      setResolveContext(null)
      finishWithSubmissions(nextSubmissions)
      return
    }

    setResolveContext({
      ...resolveContext,
      taskIndex: nextTaskIndex,
      submissionsByIndex: nextSubmissions,
    })
  }

  function handlePickerCancel() {
    setResolveContext(null)
  }

  const activeTask = resolveContext
    ? resolveContext.tasks[resolveContext.taskIndex]
    : null

  return (
    <ImageFilePicker onPick={handleScreenshotAdded}>
      {(openPicker, { isReading, error }) => (
    <motion.div
      key="bank-select"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex min-h-full flex-col px-6 py-10"
    >
      <h1 className="text-balance text-xl font-bold leading-snug text-slate-900">
        {COPY.title}
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
        {COPY.subtitle}
      </p>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <label className="text-[13px] text-slate-500">Кешбэк за</label>
        <select
          value={periodToOptionValue(cashbackPeriod)}
          disabled={lockedRowCount > 0}
          onChange={(e) => {
            const p = optionValueToPeriod(e.target.value)
            if (p) onCashbackPeriodChange(p)
          }}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900"
        >
          {getCashbackPeriodOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {names.map((name, i) => {
          const hasScreenshotConflict =
            screenshotReuseBlock?.conflictRowIndices.includes(i) ?? false
          const isLocked = i < lockedRowCount
          const fileDateLabel = getFileDateLabel(
            i,
            fileModifiedAts,
            shots,
            fileModifiedBySrc,
          )

          return (
          <div key={i} className="flex items-center gap-2">
            {shots[i] && (
              <div className="relative shrink-0">
                <img
                  src={shots[i] || "/placeholder.svg"}
                  alt={`Скриншот ${name || i + 1}`}
                  decoding="async"
                  className={`h-16 w-12 rounded-xl border bg-slate-50 object-contain ${
                    hasScreenshotConflict
                      ? "border-red-300 ring-2 ring-red-200"
                      : "border-slate-200"
                  }`}
                />
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={`Удалить скриншот ${name || i + 1}`}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-800 text-white shadow-sm transition-colors hover:bg-slate-950"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <div
              className={`min-w-0 flex-1 rounded-2xl ${
                hasScreenshotConflict ? "ring-2 ring-red-200" : ""
              }`}
            >
              {isLocked ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-medium text-slate-700">
                  {name}
                </div>
              ) : (
                <ProviderNameInput
                  value={name}
                  catalogSlug={catalogSlugs[i] ?? null}
                  catalogKind={rowKinds[i] ?? null}
                  autoFocus={focusIndexRef.current === i}
                  placeholder={COPY.placeholder}
                  onChange={(nextName, slug, rowKind) => updateRow(i, nextName, slug, rowKind)}
                />
              )}
              {fileDateLabel && (
                <p className="mt-1 px-1 text-[13px] text-slate-400">
                  Файл от {fileDateLabel}
                </p>
              )}
            </div>
          </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={openPicker}
        disabled={isReading}
        className="mt-3 flex items-center justify-center gap-2 self-start rounded-2xl border border-slate-300 px-4 py-2.5 text-[14px] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {isReading ? "Загрузка…" : COPY.addLabel}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

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

      {activeTask && (
        <ProviderKindPickerDialog
          open
          mode={activeTask.mode}
          providerName={activeTask.providerName}
          bankMatch={activeTask.bankMatch}
          marketMatch={activeTask.marketMatch}
          onSelect={handlePickerSelect}
          onCancel={handlePickerCancel}
        />
      )}

      {duplicateConfirm && (
        <DuplicateSourceConfirmDialog
          open
          providerNames={duplicateConfirm.providerNames}
          onConfirm={handleDuplicateConfirm}
          onCancel={handleDuplicateCancel}
        />
      )}

      {screenshotReuseDialogOpen && screenshotReuseBlock && (
        <ScreenshotReuseConfirmDialog
          open
          conflicts={screenshotReuseBlock.conflicts}
          onDismiss={() => setScreenshotReuseDialogOpen(false)}
        />
      )}
    </motion.div>
      )}
    </ImageFilePicker>
  )
}