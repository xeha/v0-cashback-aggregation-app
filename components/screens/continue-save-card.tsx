"use client"

import { ChevronRight } from "lucide-react"
import { formatSaveMetaLine } from "@/lib/saved-matrix-meta"
import type { SavedMatrixSummary } from "@/lib/saved-matrices"

export function ContinueSaveCardSkeleton() {
  return (
    <div
      className="mb-5 animate-pulse rounded-2xl border border-yellow-200 bg-yellow-50/60 p-4"
      aria-hidden
    >
      <div className="mb-2 h-4 w-3/5 rounded bg-yellow-100" />
      <div className="mb-3 h-3 w-4/5 rounded bg-yellow-100/80" />
      <div className="h-3 w-24 rounded bg-yellow-100/80" />
    </div>
  )
}

export function ContinueSaveCard({
  save,
  onContinue,
}: {
  save: SavedMatrixSummary
  onContinue: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onContinue(save.id)}
      className="mb-5 w-full rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-left transition-colors hover:bg-yellow-100 active:bg-yellow-200"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">{save.title}</p>
          <p className="mt-1 text-[13px] leading-snug text-slate-500">
            {formatSaveMetaLine(save)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-slate-700">
          Продолжить
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
}
