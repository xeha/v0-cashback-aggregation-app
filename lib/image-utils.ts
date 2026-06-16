const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

export const MAX_IMAGE_FILE_BYTES = 15 * 1024 * 1024
export const COMPRESS_THRESHOLD_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2048
const JPEG_QUALITY = 0.85

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

const HEIC_TYPES = new Set(["image/heic", "image/heif"])
const HEIC_EXTENSIONS = new Set(["heic", "heif"])

export class ImageReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageReadError"
  }
}

function fileExtension(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? ""
}

export function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.has(file.type)) return true
  return HEIC_EXTENSIONS.has(fileExtension(file))
}

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true

  const ext = fileExtension(file)
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif"
}

function shouldCompress(file: File): boolean {
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return false
  if (file.type === "image/gif") return false
  const ext = fileExtension(file)
  return ext !== "gif"
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import("heic2any")
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: JPEG_QUALITY,
  })
  const blob = Array.isArray(converted) ? converted[0] : converted
  const baseName = file.name.replace(/\.(heic|heif)$/i, "") || "screenshot"
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" })
}

function readFileAsDataUrl(file: File): Promise<string> {
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

function compressDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      let { width, height } = image
      const maxDimension = Math.max(width, height)

      if (maxDimension > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / maxDimension
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext("2d")
      if (!context) {
        reject(new ImageReadError("Не удалось сжать изображение."))
        return
      }

      context.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY))
    }
    image.onerror = () => reject(new ImageReadError("Не удалось обработать изображение."))
    image.src = dataUrl
  })
}

export async function readImageFile(file: File): Promise<string> {
  let source = file

  if (isHeicFile(file)) {
    try {
      source = await convertHeicToJpeg(file)
    } catch {
      throw new ImageReadError(
        "Не удалось конвертировать HEIC. Сохраните скриншот как JPEG и попробуйте снова.",
      )
    }
  }

  if (!isAcceptedImage(source)) {
    throw new ImageReadError(
      "Выберите изображение в формате JPEG, PNG, WebP или HEIC.",
    )
  }

  if (source.size > MAX_IMAGE_FILE_BYTES) {
    throw new ImageReadError("Файл слишком большой. Максимум — 15 МБ.")
  }

  const dataUrl = await readFileAsDataUrl(source)

  if (shouldCompress(source)) {
    return compressDataUrl(dataUrl)
  }

  return dataUrl
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
