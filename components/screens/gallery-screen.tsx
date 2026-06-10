"use client"

import { motion } from "framer-motion"
import { useState } from "react"

const BANK_PHOTOS = [
  "/screenshots/alfa-categories.jpeg",
  "/screenshots/cashback-june.jpeg",
  "/screenshots/aliexpress.jpeg",
  "/screenshots/cashback-june.jpeg",
  "/screenshots/alfa-categories.jpeg",
  "/screenshots/aliexpress.jpeg",
  "/screenshots/aliexpress.jpeg",
  "/screenshots/alfa-categories.jpeg",
  "/screenshots/cashback-june.jpeg",
]

const MARKET_PHOTOS = [
  "/screenshots/magnit-categories.jpg",
  "/screenshots/pyaterochka-categories.jpg",
  "/screenshots/lenta-categories.jpg",
  "/screenshots/pyaterochka-categories.jpg",
  "/screenshots/magnit-categories.jpg",
  "/screenshots/lenta-categories.jpg",
  "/screenshots/lenta-categories.jpg",
  "/screenshots/magnit-categories.jpg",
  "/screenshots/pyaterochka-categories.jpg",
]

export function GalleryScreen({
  onCancel,
  onAdd,
  kind = "bank",
}: {
  onCancel: () => void
  onAdd: () => void
  kind?: "bank" | "market"
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const PHOTOS = kind === "market" ? MARKET_PHOTOS : BANK_PHOTOS

  return (
    <motion.div
      key="gallery"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-50 flex flex-col bg-black"
    >
      {/* Header */}
      <div className="flex items-center justify-center border-b border-white/10 px-4 py-3.5">
        <div className="text-center">
          <p className="text-[15px] font-semibold text-white">Все фото</p>
          <p className="text-xs text-white/50">Выберите один скриншот</p>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-0.5">
        <div className="grid grid-cols-3 gap-0.5">
          {PHOTOS.map((src, i) => {
            const isSelected = selected === i
            return (
              <button
                key={i}
                onClick={() => setSelected(isSelected ? null : i)}
                className="relative aspect-square overflow-hidden bg-neutral-800"
              >
                <img
                  src={src || "/placeholder.svg"}
                  alt={`Скриншот ${i + 1}`}
                  className={`h-full w-full object-cover transition-transform duration-200 ${
                    isSelected ? "scale-95" : "scale-100"
                  }`}
                />
                <div
                  className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                    isSelected
                      ? "border-white bg-blue-500"
                      : "border-white/80 bg-black/20"
                  }`}
                >
                  {isSelected && (
                    <span className="text-[11px] font-bold text-white">1</span>
                  )}
                </div>
                {isSelected && (
                  <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-blue-500" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3.5">
        <button
          onClick={onCancel}
          className="text-[15px] font-medium text-white/80 transition-colors hover:text-white"
        >
          Отмена
        </button>
        <button
          onClick={onAdd}
          disabled={selected === null}
          className="rounded-full bg-yellow-200 px-5 py-2 text-[15px] font-semibold text-slate-900 transition-opacity disabled:opacity-30"
        >
          Добавить ({selected === null ? 0 : 1})
        </button>
      </div>
    </motion.div>
  )
}
