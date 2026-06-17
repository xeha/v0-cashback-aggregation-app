/** Lowercase compare for Russian category labels. */
export function normalizeCategoryLabel(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim()
}

/** CashPack title case → readable Russian (sentence case, «и» lowercase). */
export function formatCategoryLabel(name: string): string {
  return name
    .split(/\s+/)
    .map((word, index) => {
      if (word.toLowerCase() === "и" && index > 0) return "и"
      if (/^\(.+\)$/.test(word)) return word
      const lower = word.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(" ")
}

export function labelsEquivalent(a: string, b: string): boolean {
  return normalizeCategoryLabel(a) === normalizeCategoryLabel(b)
}
