import { imageSrcToBase64 } from "@/lib/image-utils"
import { createProviderFromSubmission, mergeMappedItems } from "@/lib/matrix"
import type {
  CashbackMatrix,
  CategoryMapResponse,
  Kind,
  LowConfidenceItem,
  MappedItem,
  OcrExtractResponse,
  SourceSubmission,
} from "@/lib/types"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"
const REQUEST_TIMEOUT_MS = 60_000

/** Below this confidence, show a warning on the results screen. */
export const LOW_CONFIDENCE_UI_THRESHOLD = 0.55

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class OcrEmptyError extends ApiError {
  constructor() {
    super("На скриншоте не найдены категории кэшбэка.", 422)
  }
}

export class OcrUnreliableError extends ApiError {
  constructor() {
    super(
      "Категории распознаны неуверенно — похоже, это не скриншот кэшбэка. Выберите другое фото.",
      422,
    )
  }
}

export function isOcrRecognitionFailure(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false
  if (error instanceof OcrEmptyError || error instanceof OcrUnreliableError) return true
  return error.status === 502
}

function isUnreliableMapping(items: MappedItem[]): boolean {
  if (items.length === 0) return true

  const confidences = items.map((item) => item.confidence)
  const average =
    confidences.reduce((sum, value) => sum + value, 0) / confidences.length
  const allBelowThreshold = confidences.every(
    (value) => value < LOW_CONFIDENCE_UI_THRESHOLD,
  )
  const mostlyFallback =
    items.filter((item) => item.unified_category === "Прочее").length /
      items.length >=
    0.5

  return allBelowThreshold || average < LOW_CONFIDENCE_UI_THRESHOLD || mostlyFallback
}

function collectLowConfidenceItems(
  items: MappedItem[],
  providerName: string,
): LowConfidenceItem[] {
  return items
    .filter((item) => item.confidence < LOW_CONFIDENCE_UI_THRESHOLD)
    .map((item) => ({
      providerName,
      rawCategory: item.raw_category,
      unifiedCategory: item.unified_category,
      confidence: item.confidence,
    }))
}

export interface ProcessSubmissionResult {
  matrix: CashbackMatrix
  lowConfidenceItems: LowConfidenceItem[]
}

function isRequestTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === "TimeoutError" || error.name === "AbortError"
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (isRequestTimeoutError(error)) {
      throw new ApiError("Сервер не ответил вовремя. Попробуйте ещё раз.", 0)
    }
    throw new ApiError(
      "Сервер недоступен. Проверьте NEXT_PUBLIC_BACKEND_URL и запущен ли FastAPI.",
      0,
    )
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const payload = await response.json()
      detail = payload.detail ?? detail
    } catch {
      // ignore parse errors
    }
    throw new ApiError(String(detail), response.status)
  }

  return response.json() as Promise<T>
}

export async function extractOcr(
  image_base64: string,
  mime_type: string,
): Promise<OcrExtractResponse> {
  return postJson<OcrExtractResponse>("/api/ocr/extract", {
    image_base64,
    mime_type,
  })
}

export async function mapCategories(
  items: { raw_category: string; rate: number }[],
  source_name?: string,
): Promise<CategoryMapResponse> {
  return postJson<CategoryMapResponse>("/api/category/map", {
    items,
    source_name,
  })
}

export async function processSubmission(
  submission: SourceSubmission,
  existingKeys: Set<string>,
  currentMatrix: CashbackMatrix | null,
): Promise<ProcessSubmissionResult> {
  const { image_base64, mime_type } = await imageSrcToBase64(submission.screenshotSrc)
  const ocr = await extractOcr(image_base64, mime_type)

  if (ocr.items.length === 0) {
    throw new OcrEmptyError()
  }

  const mapped = await mapCategories(ocr.items, submission.providerName)
  const mappedItems = mapped.items as MappedItem[]

  if (isUnreliableMapping(mappedItems)) {
    throw new OcrUnreliableError()
  }

  const provider = createProviderFromSubmission(
    submission,
    existingKeys,
    currentMatrix?.providers ?? [],
  )

  const matrix = mergeMappedItems(
    currentMatrix,
    provider,
    mappedItems,
    submission.kind,
  )

  return {
    matrix,
    lowConfidenceItems: collectLowConfidenceItems(mappedItems, submission.providerName),
  }
}

/** Runs OCR + merge and keeps `keys` in sync with the matrix (by provider key, not display name). */
export async function processSubmissionWithKeyTracking(
  submission: SourceSubmission,
  keys: Set<string>,
  currentMatrix: CashbackMatrix | null,
): Promise<ProcessSubmissionResult> {
  currentMatrix?.providers.forEach((provider) => keys.add(provider.key))

  const result = await processSubmission(submission, keys, currentMatrix)

  const newProvider = result.matrix.providers.find(
    (provider) =>
      !currentMatrix?.providers.some((existing) => existing.key === provider.key),
  )
  if (newProvider) keys.add(newProvider.key)

  return result
}

export async function processAllSubmissions(
  submissions: SourceSubmission[],
): Promise<{ bank: CashbackMatrix | null; market: CashbackMatrix | null }> {
  let bankMatrix: CashbackMatrix | null = null
  let marketMatrix: CashbackMatrix | null = null
  const bankKeys = new Set<string>()
  const marketKeys = new Set<string>()

  for (const submission of submissions) {
    const keys = submission.kind === "market" ? marketKeys : bankKeys
    const current = submission.kind === "market" ? marketMatrix : bankMatrix

    const result = await processSubmissionWithKeyTracking(submission, keys, current)

    if (submission.kind === "market") {
      marketMatrix = result.matrix
    } else {
      bankMatrix = result.matrix
    }
  }

  return { bank: bankMatrix, market: marketMatrix }
}
