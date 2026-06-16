const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

export const MAX_IMAGE_FILE_BYTES = 15 * 1024 * 1024

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

export class ImageReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageReadError"
  }
}

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif"
}

export function readImageFile(file: File): Promise<string> {
  if (!isAcceptedImage(file)) {
    return Promise.reject(
      new ImageReadError("Выберите изображение в формате JPEG, PNG или WebP."),
    )
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return Promise.reject(new ImageReadError("Файл слишком большой. Максимум — 15 МБ."))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new ImageReadError("Не удалось прочитать изображение."))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(new ImageReadError("Ошибка чтения файла."))
    reader.readAsDataURL(file)
  })
}

function guessMimeType(src: string): string {
  const ext = src.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXT[ext] ?? "image/jpeg"
}

function stripDataUrlPrefix(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    return { base64: dataUrl, mimeType: "image/jpeg" }
  }
  return { base64: match[2], mimeType: match[1] }
}

export async function imageSrcToBase64(
  src: string,
): Promise<{ image_base64: string; mime_type: string }> {
  if (src.startsWith("data:")) {
    const { base64, mimeType } = stripDataUrlPrefix(src)
    return { image_base64: base64, mime_type: mimeType }
  }

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Не удалось загрузить изображение: ${src}`)
  }

  const blob = await response.blob()
  const mimeType = blob.type || guessMimeType(src)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Не удалось прочитать изображение"))
        return
      }
      const { base64 } = stripDataUrlPrefix(result)
      resolve({ image_base64: base64, mime_type: mimeType })
    }
    reader.onerror = () => reject(new Error("Ошибка чтения файла"))
    reader.readAsDataURL(blob)
  })
}
