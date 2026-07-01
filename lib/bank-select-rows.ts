import type { Kind, SourceSubmission } from "@/lib/types"

export interface BankSelectInitialRow {
  providerName: string
  screenshotSrc: string
  kind: Kind | null
  catalogSlug: string | null
  fileModifiedAt?: string | null
}

export function submissionToBankSelectRow(
  submission: SourceSubmission,
): BankSelectInitialRow {
  return {
    providerName: submission.providerName,
    screenshotSrc: submission.screenshotSrc,
    kind: submission.kind,
    catalogSlug: submission.providerSlug ?? null,
    fileModifiedAt: submission.fileModifiedAt ?? null,
  }
}

export function isBankSelectRowComplete(name: string, screenshotSrc: string): boolean {
  return name.trim().length > 0 && screenshotSrc.length > 0
}

export function canProceedBankSelect(names: string[], shots: string[]): boolean {
  return names.some((name, index) => isBankSelectRowComplete(name, shots[index] ?? ""))
}

export function buildBankSelectRowState(
  initialRows: BankSelectInitialRow[] | undefined,
  initialShot: string,
) {
  if (initialRows && initialRows.length > 0) {
    return {
      names: initialRows.map((row) => row.providerName),
      shots: initialRows.map((row) => row.screenshotSrc),
      catalogSlugs: initialRows.map((row) => row.catalogSlug),
      rowKinds: initialRows.map((row) => row.kind),
      fileModifiedAts: initialRows.map((row) => row.fileModifiedAt ?? null),
    }
  }

  return {
    names: [""],
    shots: [initialShot],
    catalogSlugs: [null] as (string | null)[],
    rowKinds: [null] as (Kind | null)[],
    fileModifiedAts: [null] as (string | null)[],
  }
}
