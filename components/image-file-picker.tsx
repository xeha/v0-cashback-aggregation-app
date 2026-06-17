"use client"

import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { ImageReadError, readImageFile } from "@/lib/image-utils"

export interface ImageFilePickerState {
  isReading: boolean
  error: string | null
}

export function ImageFilePicker({
  onPick,
  onDismiss,
  children,
}: {
  onPick: (dataUrl: string) => void
  onDismiss?: () => void
  children: (openPicker: () => void, state: ImageFilePickerState) => ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      onDismiss?.()
      return
    }

    setError(null)
    setIsReading(true)

    try {
      const dataUrl = await readImageFile(file)
      onPick(dataUrl)
    } catch (err) {
      setError(err instanceof ImageReadError ? err.message : "Не удалось загрузить изображение.")
    } finally {
      setIsReading(false)
    }
  }

  function openPicker() {
    setError(null)
    inputRef.current?.click()
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleChange}
      />
      {children(openPicker, { isReading, error })}
    </>
  )
}
