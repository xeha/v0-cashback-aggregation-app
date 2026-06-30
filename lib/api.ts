import { getBackendUrl } from "@/lib/backend-url"
import { imageSrcToBase64 } from "@/lib/image-utils"
import {
  apiMatrixToClient,
  clientMatrixToApi,
  enrichMatrixLogos,
  type ApiProcessSubmissionResponse,
} from "@/lib/matrix-api"
import type {
  BankOfferItem,
  CashbackMatrix,
  LowConfidenceItem,
  SourceSubmission,
} from "@/lib/types"

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
    super("На скриншоте не найдены категории кешбэка.", 422)
  }
}

export class OcrUnreliableError extends ApiError {
  constructor() {
    super(
      "Категории распознаны неуверенно — похоже, это не скриншот кешбэка. Выберите другое фото.",
      422,
    )
  }
}

export function isOcrRecognitionFailure(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false
  if (error instanceof OcrEmptyError || error instanceof OcrUnreliableError) return true
  return error.status === 502
}

export interface ProcessSubmissionResult {
  matrix: CashbackMatrix
  lowConfidenceItems: LowConfidenceItem[]
  bankOfferItems: BankOfferItem[]
}

function isRequestTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === "TimeoutError" || error.name === "AbortError"
}

function mapPipelineError(error: ApiError): never {
  if (error.status === 422) {
    if (error.message.includes("не найдены")) throw new OcrEmptyError()
    if (error.message.includes("неуверенно")) throw new OcrUnreliableError()
  }
  throw error
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${getBackendUrl()}${path}`, {
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
      if (typeof payload.detail === "string") {
        detail = payload.detail
      } else if (Array.isArray(payload.detail)) {
        detail = payload.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join("; ")
      }
    } catch {
      if (response.status === 500 && detail === "Internal Server Error") {
        detail =
          "Сервер не успел обработать запрос. Проверьте, что FastAPI запущен на порту 8000, и попробуйте снова."
      }
    }
    throw new ApiError(String(detail), response.status)
  }

  return response.json() as Promise<T>
}

export async function processSubmission(
  submission: SourceSubmission,
  currentMatrix: CashbackMatrix | null,
): Promise<ProcessSubmissionResult> {
  const { image_base64, mime_type } = await imageSrcToBase64(submission.screenshotSrc)

  try {
    const response = await postJson<ApiProcessSubmissionResponse>("/api/pipeline/process", {
      image_base64,
      mime_type,
      kind: submission.kind,
      provider_name: submission.providerName,
      provider_slug: submission.providerSlug,
      current_matrix: currentMatrix ? clientMatrixToApi(currentMatrix) : null,
    })

    const matrix = enrichMatrixLogos(apiMatrixToClient(response.matrix))

    return {
      matrix,
      lowConfidenceItems: response.low_confidence.map((item) => ({
        providerName: item.provider_name,
        rawCategory: item.raw_category,
        unifiedCategory: item.unified_category,
        confidence: item.confidence,
      })),
      bankOfferItems: response.bank_offers.map((item) => ({
        providerName: item.provider_name,
        rawCategory: item.raw_category,
        unifiedCategory: item.unified_category,
        rate: item.rate,
      })),
    }
  } catch (error) {
    if (error instanceof ApiError) mapPipelineError(error)
    throw error
  }
}

/** Runs OCR + merge and keeps `keys` in sync with the matrix (by provider key, not display name). */
export async function processSubmissionWithKeyTracking(
  submission: SourceSubmission,
  keys: Set<string>,
  currentMatrix: CashbackMatrix | null,
): Promise<ProcessSubmissionResult> {
  currentMatrix?.providers.forEach((provider) => keys.add(provider.key))

  const result = await processSubmission(submission, currentMatrix)

  const newProvider = result.matrix.providers.find(
    (provider) =>
      !currentMatrix?.providers.some((existing) => existing.key === provider.key),
  )
  if (newProvider) keys.add(newProvider.key)

  return result
}
