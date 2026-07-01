import { getBackendUrl } from "@/lib/backend-url"
import { imageSrcToBase64 } from "@/lib/image-utils"
import {
  apiMatrixStateToClient,
  apiProcessResponseToClient,
  clientMatrixToApi,
  enrichMatrixLogos,
  type ApiBatchPipelineErrorDetail,
  type ApiBatchPipelineResponse,
  type ApiProcessSubmissionResponse,
} from "@/lib/matrix-api"
import type {
  BankOfferItem,
  CashbackMatrix,
  LowConfidenceItem,
  MatrixState,
  ProcessingSummary,
  SourceSubmission,
} from "@/lib/types"

const REQUEST_TIMEOUT_MS = 60_000
const USE_BATCH = process.env.NEXT_PUBLIC_USE_BATCH !== "0"

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

export class BatchProcessError extends ApiError {
  failedIndex: number
  isOcrFailure: boolean
  partialMatrix: MatrixState
  partialSummary: ProcessingSummary

  constructor(detail: ApiBatchPipelineErrorDetail, status: number) {
    super(detail.message, status)
    this.failedIndex = detail.failed_index
    this.isOcrFailure = detail.is_ocr_failure
    this.partialMatrix = enrichMatrixState(apiMatrixStateToClient(detail.matrix))
    this.partialSummary = mapSummaryFromApi(detail.summary)
  }
}

export function isOcrRecognitionFailure(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false
  if (error instanceof OcrEmptyError || error instanceof OcrUnreliableError) return true
  if (error instanceof BatchProcessError && error.isOcrFailure) return true
  return error.status === 502
}

export interface ProcessSubmissionResult {
  matrix: CashbackMatrix
  lowConfidenceItems: LowConfidenceItem[]
  bankOfferItems: BankOfferItem[]
}

export interface ProcessBatchResult {
  matrix: MatrixState
  summary: ProcessingSummary
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

function isBatchErrorDetail(value: unknown): value is ApiBatchPipelineErrorDetail {
  if (!value || typeof value !== "object") return false
  const detail = value as ApiBatchPipelineErrorDetail
  return (
    typeof detail.message === "string" &&
    typeof detail.failed_index === "number" &&
    typeof detail.is_ocr_failure === "boolean" &&
    Boolean(detail.matrix) &&
    Boolean(detail.summary)
  )
}

function mapSummaryFromApi(
  summary: ApiBatchPipelineResponse["summary"],
): ProcessingSummary {
  return {
    skipped: summary.skipped.map((item) => ({
      providerName: item.provider_name ?? "",
      message: item.message ?? "",
    })),
    lowConfidence: summary.low_confidence.map((item) => ({
      providerName: item.provider_name,
      rawCategory: item.raw_category,
      unifiedCategory: item.unified_category,
      confidence: item.confidence,
    })),
    bankOffers: summary.bank_offers.map((item) => ({
      providerName: item.provider_name,
      rawCategory: item.raw_category,
      unifiedCategory: item.unified_category,
      rate: item.rate,
    })),
  }
}

function enrichMatrixState(matrix: MatrixState): MatrixState {
  return {
    bank: matrix.bank ? enrichMatrixLogos(matrix.bank) : null,
    market: matrix.market ? enrichMatrixLogos(matrix.market) : null,
  }
}

async function postJson<T>(path: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${getBackendUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
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
    let detail: unknown = response.statusText
    try {
      const payload = await response.json()
      detail = payload.detail ?? payload
    } catch {
      if (response.status === 500 && detail === "Internal Server Error") {
        detail =
          "Сервер не успел обработать запрос. Проверьте, что FastAPI запущен на порту 8000, и попробуйте снова."
      }
    }

    if (isBatchErrorDetail(detail)) {
      throw new BatchProcessError(detail, response.status)
    }

    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join("; ")
          : response.statusText

    throw new ApiError(String(message), response.status)
  }

  return response.json() as Promise<T>
}

function mapProcessResponse(response: ApiProcessSubmissionResponse): ProcessSubmissionResult {
  const matrix = enrichMatrixLogos(apiProcessResponseToClient(response))
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
    return mapProcessResponse(response)
  } catch (error) {
    if (error instanceof ApiError) mapPipelineError(error)
    throw error
  }
}

export async function processBatch(
  submissions: SourceSubmission[],
  existingMatrix: MatrixState,
): Promise<ProcessBatchResult> {
  const payloadSubmissions = await Promise.all(
    submissions.map(async (submission) => {
      const { image_base64, mime_type } = await imageSrcToBase64(submission.screenshotSrc)
      return {
        image_base64,
        mime_type,
        kind: submission.kind,
        provider_name: submission.providerName,
        provider_slug: submission.providerSlug,
      }
    }),
  )

  const timeoutMs = REQUEST_TIMEOUT_MS * Math.max(1, submissions.length)

  try {
    const response = await postJson<ApiBatchPipelineResponse>(
      "/api/pipeline/batch",
      {
        submissions: payloadSubmissions,
        existing_matrix: {
          bank: existingMatrix.bank ? clientMatrixToApi(existingMatrix.bank) : null,
          market: existingMatrix.market ? clientMatrixToApi(existingMatrix.market) : null,
        },
      },
      timeoutMs,
    )

    return {
      matrix: enrichMatrixState(apiMatrixStateToClient(response.matrix)),
      summary: mapSummaryFromApi(response.summary),
    }
  } catch (error) {
    if (error instanceof BatchProcessError) throw error
    if (error instanceof ApiError) mapPipelineError(error)
    throw error
  }
}

/** @deprecated Used only when NEXT_PUBLIC_USE_BATCH=0 */
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

export function shouldUseBatchPipeline(): boolean {
  return USE_BATCH
}
