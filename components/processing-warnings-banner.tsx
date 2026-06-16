"use client"

import { AlertTriangle } from "lucide-react"
import type { LowConfidenceItem, ProcessingSummary } from "@/lib/types"

function formatLowConfidence(items: LowConfidenceItem[]): string {
  const unique = [...new Set(items.map((item) => item.unifiedCategory))]
  if (unique.length === 1) return `«${unique[0]}»`
  if (unique.length === 2) return `«${unique[0]}» и «${unique[1]}»`
  return `${unique.length} категорий`
}

export function ProcessingWarningsBanner({ summary }: { summary: ProcessingSummary }) {
  const { lowConfidence } = summary
  if (lowConfidence.length === 0) return null

  return (
    <div className="mb-5">
      <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <div className="min-w-0 text-[13px] leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">Проверьте категории</p>
          <p className="mt-0.5">
            Для {formatLowConfidence(lowConfidence)} сопоставление было неуверенным. При
            необходимости загрузите скриншот заново.
          </p>
        </div>
      </div>
    </div>
  )
}
