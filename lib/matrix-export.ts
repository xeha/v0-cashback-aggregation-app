import { toPng } from "html-to-image"
import { formatCategoryLabel } from "@/lib/category-label"
import {
  countProvidersInGroup,
  getMarketGroupDisplayLabel,
  getVisibleBankGroupRows,
  getVisibleMarketGroupRows,
  groupHasSubcategories,
  resolveMarketRowCategory,
} from "@/lib/matrix"
import type { Kind, MatrixGroup, MatrixProvider } from "@/lib/types"

export type PngDeliveryMethod = "shared" | "downloaded" | "cancelled"
export type TextShareMethod = "shared" | "copied" | "cancelled" | "unsupported"

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",")
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png"
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

function formatRatesLine(rates: Record<string, number>, providers: MatrixProvider[]): string {
  return providers
    .map((provider) => {
      const rate = rates[provider.key]
      return rate !== undefined ? `${provider.name} ${rate}%` : null
    })
    .filter((line): line is string => line !== null)
    .join(", ")
}

export function buildMatrixShareText({
  tab,
  tabLabel,
  periodLabel,
  groups,
  providers,
}: {
  tab: Kind
  tabLabel: string
  periodLabel: string
  groups: MatrixGroup[]
  providers: MatrixProvider[]
}): string {
  const lines: string[] = [`Кешбэки — ${periodLabel} (${tabLabel})`, ""]

  for (const group of groups) {
    const hasSubcategories = groupHasSubcategories(group, tab)
    const providerCountInGroup = tab === "market" ? countProvidersInGroup(group) : 0
    const resolveRowLabel = (row: (typeof group.rows)[number]) =>
      tab === "market" ? resolveMarketRowCategory(row, providerCountInGroup) : row.category

    if (!hasSubcategories) {
      const row = group.rows[0]
      const label = row ? resolveRowLabel(row) : getMarketGroupDisplayLabel(group)
      const ratesLine = formatRatesLine(group.summaryRates, providers)
      if (ratesLine) {
        lines.push(`• ${formatCategoryLabel(label)}: ${ratesLine}`)
      }
      continue
    }

    const headerLabel = formatCategoryLabel(getMarketGroupDisplayLabel(group))
    const headerRates = formatRatesLine(group.summaryRates, providers)
    if (headerRates) {
      lines.push(`• ${headerLabel}: ${headerRates}`)
    }

    const visibleRows =
      tab === "market" ? getVisibleMarketGroupRows(group) : getVisibleBankGroupRows(group)
    for (const child of visibleRows) {
      const childRates = formatRatesLine(child.rates, providers)
      if (!childRates) continue
      lines.push(`  — ${formatCategoryLabel(resolveRowLabel(child))}: ${childRates}`)
    }
  }

  lines.push("", "CashbackBrain")
  return lines.join("\n")
}

export function buildMatrixPngFilename({
  periodLabel,
  tab,
}: {
  periodLabel: string
  tab: Kind
}): string {
  const period = periodLabel.toLowerCase().replace(/\s+/g, "-")
  const tabSlug = tab === "bank" ? "banki" : "supermarkety"
  return `cashback-${period}-${tabSlug}.png`
}

export async function captureElementPng(element: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    skipFonts: false,
  })
  return dataUrlToBlob(dataUrl)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function deliverPngFile(blob: Blob, filename: string): Promise<PngDeliveryMethod> {
  const file = new File([blob], filename, { type: "image/png" })

  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Кешбэки",
      })
      return "shared"
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled"
      }
    }
  }

  downloadBlob(blob, filename)
  return "downloaded"
}

export async function shareTextNative(text: string, url?: string): Promise<TextShareMethod> {
  const payload: ShareData = {
    text,
    ...(url ? { url } : {}),
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(payload)
      return "shared"
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled"
      }
    }
  }

  if (typeof navigator.clipboard?.writeText === "function") {
    const clipboardText = url ? `${text}\n\n${url}` : text
    await navigator.clipboard.writeText(clipboardText)
    return "copied"
  }

  return "unsupported"
}

export function buildTelegramShareUrl(text: string, url: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}

export function buildWhatsAppShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n\n${url}`)}`
}

export function buildEmailShareUrl(text: string, url: string, subject: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
}
