const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
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
