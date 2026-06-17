"use client"

import { motion } from "framer-motion"
import { useState } from "react"
import { ImageFilePicker } from "@/components/image-file-picker"

export function GalleryScreen({
  initialSrc = null,
  onCancel,
  onAdd,
  kind: _kind = "bank",
}: {
  initialSrc?: string | null
  onCancel: () => void
  onAdd: (src: string) => void
  kind?: "bank" | "market"
}) {
  const [selectedSrc, setSelectedSrc] = useState<string | null>(initialSrc)

  return (
    <ImageFilePicker
      onPick={setSelectedSrc}
      onDismiss={() => {
        if (!selectedSrc) onCancel()
      }}
    >
      {(openPicker, { isReading, error }) => (
        <motion.div
          key="gallery"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 z-50 flex flex-col bg-black"
        >
          <div className="flex items-center justify-center border-b border-white/10 px-4 py-3.5">
            <div className="text-center">
              <p className="text-[15px] font-semibold text-white">Выберите скриншот</p>
              <p className="text-xs text-white/50">
                {selectedSrc ? "Проверьте фото и нажмите «Добавить»" : "Откройте галерею устройства"}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
            {selectedSrc ? (
              <img
                src={selectedSrc}
                alt="Выбранный скриншот"
                className="max-h-[50vh] w-full rounded-2xl object-contain"
              />
            ) : (
              <div className="flex h-48 w-full items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5">
                <p className="text-sm text-white/50">Скриншот не выбран</p>
              </div>
            )}

            <button
              type="button"
              onClick={openPicker}
              disabled={isReading}
              className="rounded-full bg-white/10 px-5 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-50"
            >
              {isReading
                ? "Загрузка…"
                : selectedSrc
                  ? "Выбрать другое"
                  : "Выбрать из галереи"}
            </button>

            {error && (
              <p className="text-center text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3.5">
            <button
              type="button"
              onClick={onCancel}
              className="text-[15px] font-medium text-white/80 transition-colors hover:text-white"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => selectedSrc && onAdd(selectedSrc)}
              disabled={selectedSrc === null || isReading}
              className="rounded-full bg-yellow-200 px-5 py-2 text-[15px] font-semibold text-slate-900 transition-opacity disabled:opacity-30"
            >
              Добавить
            </button>
          </div>
        </motion.div>
      )}
    </ImageFilePicker>
  )
}
