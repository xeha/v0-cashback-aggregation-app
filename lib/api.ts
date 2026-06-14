import { imageSrcToBase64 } from "@/lib/image-utils"
import { createProviderFromSubmission, mergeMappedItems } from "@/lib/matrix"
import type {
  CashbackMatrix,
  CategoryMapResponse,
  Kind,
  MappedItem,
  OcrExtractResponse,
  SourceSubmission,
} from "@/lib/types"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
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
): Promise<CashbackMatrix> {
  const { image_base64, mime_type } = await imageSrcToBase64(submission.screenshotSrc)
  const ocr = await extractOcr(image_base64, mime_type)

  if (ocr.items.length === 0) {
    throw new ApiError("На скриншоте не найдены категории кэшбэка.", 422)
  }

  const mapped = await mapCategories(ocr.items, submission.providerName)
  const provider = createProviderFromSubmission(submission, existingKeys)

  return mergeMappedItems(
    currentMatrix,
    provider,
    mapped.items as MappedItem[],
    submission.kind,
  )
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

    current?.providers.forEach((provider) => keys.add(provider.key))

    const result = await processSubmission(submission, keys, current)
    const newProvider = result.providers.find(
      (provider) => !current?.providers.some((existing) => existing.key === provider.key),
    )
    if (newProvider) keys.add(newProvider.key)

    if (submission.kind === "market") {
      marketMatrix = result
    } else {
      bankMatrix = result
    }
  }

  return { bank: bankMatrix, market: marketMatrix }
}

export { ApiError }
