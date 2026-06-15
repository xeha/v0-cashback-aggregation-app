"use client"

import { AnimatePresence, motion } from "framer-motion"
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
import { GalleryScreen } from "@/components/screens/gallery-screen"
import { findCatalogMatches, normalizeProviderName, type ProviderSuggestion } from "@/lib/provider-logos"
import type { Kind, SourceSubmission } from "@/lib/types"

const COPY = {
  title: "Выберите или введите источник кэшбека",
  subtitle: "Укажите, из какого приложения сделан скриншот — банка или супермаркета",
  placeholder: "Например, Сбер или Пятёрочка",
  addLabel: "Ещё кэшбек",
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
}

function getScreenshotReuseConflicts(rows: SubmissionRow[]): ScreenshotReuseBlockState {
  const seenBySrc = new Map<string, { name: string; rowIndex: number }>()
  const conflicts: ScreenshotReuseConflict[] = []
  const conflictRowIndices = new Set<number>()
  const conflictKeys = new Set<string>()

  for (const { rowIndex, providerName, screenshotSrc } of rows) {
    const name = providerName.trim()
    if (!screenshotSrc || !name) continue

    const first = seenBySrc.get(screenshotSrc)
    if (!first) {
      seenBySrc.set(screenshotSrc, { name, rowIndex })
      continue
    }

    if (normalizeProviderName(first.name) === normalizeProviderName(name)) continue

    const key = `${screenshotSrc}:${normalizeProviderName(name)}`
    if (!conflictKeys.has(key)) {
      conflictKeys.add(key)
      conflicts.push({ originalProviderName: first.name, newProviderName: name })
    }

    conflictRowIndices.add(first.rowIndex)
    conflictRowIndices.add(rowIndex)
  }

  return { conflicts, conflictRowIndices: [...conflictRowIndices] }
}

function getDuplicateProviderNames(providerNames: string[]): string[] {
  const seen = new Map<string, string>()
  const duplicates = new Set<string>()

  for (const name of providerNames) {
    const trimmed = name.trim()
    if (!trimmed) continue

    const normalized = normalizeProviderName(trimmed)
    const existing = seen.get(normalized)
    if (existing) {
      duplicates.add(existing)
      continue
    }

    seen.set(normalized, trimmed)
  }

  return [...duplicates].sort((a, b) => a.localeCompare(b, "ru"))
}

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
  const [names, setNames] = useState<string[]>([""])
  const [catalogSlugs, setCatalogSlugs] = useState<(string | null)[]>([null])
  const [rowKinds, setRowKinds] = useState<(Kind | null)[]>([null])
  const [shots, setShots] = useState<string[]>([initialShot])
  const [pendingBankIndex, setPendingBankIndex] = useState<number | null>(null)
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
    clearScreenshotReuseBlock()
    setNames((prev) => prev.map((value, i) => (i === index ? name : value)))
    setCatalogSlugs((prev) => prev.map((value, i) => (i === index ? slug : value)))
    setRowKinds((prev) => prev.map((value, i) => (i === index ? rowKind : value)))
  }

  function startAddBank() {
    setPendingBankIndex(names.length)
  }

  function handleScreenshotAdded(src: string) {
    const newIndex = names.length
    setNames((prev) => [...prev, ""])
    setCatalogSlugs((prev) => [...prev, null])
    setRowKinds((prev) => [...prev, null])
    setShots((prev) => [...prev, src])
    setPendingBankIndex(null)
    focusIndexRef.current = newIndex
  }

  function removeRow(index: number) {
    clearScreenshotReuseBlock()
    setNames((prev) => prev.filter((_, i) => i !== index))
    setCatalogSlugs((prev) => prev.filter((_, i) => i !== index))
    setRowKinds((prev) => prev.filter((_, i) => i !== index))
    setShots((prev) => prev.filter((_, i) => i !== index))
  }

  const canProceed = names.some((name) => name.trim().length > 0)

  function buildSubmission(
    rowIndex: number,
    providerName: string,
    rowKind: Kind,
    providerSlug?: string,
  ): SourceSubmission {
    return {
      providerName,
      screenshotSrc: shots[rowIndex] ?? "",
      kind: rowKind,
      providerSlug,
    }
  }

  function finishWithSubmissions(submissionsByIndex: Map<number, SourceSubmission>) {
    const rows = [...submissionsByIndex.entries()].map(([rowIndex, submission]) => ({
      rowIndex,
      providerName: submission.providerName,
      screenshotSrc: submission.screenshotSrc,
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

    const duplicateNames = getDuplicateProviderNames(
      ordered.map((submission) => submission.providerName),
    )

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

      <div className="mt-7 flex flex-col gap-3">
        {names.map((name, i) => {
          const hasScreenshotConflict =
            screenshotReuseBlock?.conflictRowIndices.includes(i) ?? false

          return (
          <div key={i} className="flex items-center gap-2">
            {shots[i] && (
              <img
                src={shots[i] || "/placeholder.svg"}
                alt={`Скриншот ${name || i + 1}`}
                className={`h-12 w-12 shrink-0 rounded-xl border object-cover ${
                  hasScreenshotConflict
                    ? "border-red-300 ring-2 ring-red-200"
                    : "border-slate-200"
                }`}
              />
            )}
            <div
              className={`min-w-0 flex-1 rounded-2xl ${
                hasScreenshotConflict ? "ring-2 ring-red-200" : ""
              }`}
            >
              <ProviderNameInput
                value={name}
                catalogSlug={catalogSlugs[i] ?? null}
                catalogKind={rowKinds[i] ?? null}
                autoFocus={focusIndexRef.current === i}
                placeholder={COPY.placeholder}
                onChange={(nextName, slug, rowKind) => updateRow(i, nextName, slug, rowKind)}
              />
            </div>
            {names.length > 1 && (
              <button
                onClick={() => removeRow(i)}
                aria-label="Удалить источник"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          )
        })}
      </div>

      <button
        onClick={startAddBank}
        className="mt-3 flex items-center justify-center gap-2 self-start rounded-2xl border border-slate-300 px-4 py-2.5 text-[14px] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" />
        {COPY.addLabel}
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
  )
}
