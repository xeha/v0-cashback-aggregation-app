"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Check,
  Download,
  Loader2,
  Smartphone,
  X,
  Share,
} from "lucide-react"
import { getMobilePlatform, type MobilePlatform } from "@/lib/pwa"

/* ------------------------------------------------------------------ */
/* Save PNG overlay                                                    */
/* ------------------------------------------------------------------ */

export type SavePngStatus = "saving" | "done" | "error" | null

export function SavePngOverlay({
  status,
  previewUrl,
  onClose,
}: {
  status: SavePngStatus
  previewUrl?: string | null
  onClose: () => void
}) {
  useEffect(() => {
    if (status === "done" && !previewUrl) {
      const t = setTimeout(onClose, 2000)
      return () => clearTimeout(t)
    }
    if (status === "error") {
      const t = setTimeout(onClose, 3000)
      return () => clearTimeout(t)
    }
  }, [status, previewUrl, onClose])

  return (
    <AnimatePresence>
      {status && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {status === "saving" && (
            <motion.div
              className="flex w-44 flex-col items-center gap-4 rounded-3xl bg-white px-6 py-7 shadow-xl"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Loader2 className="h-12 w-12 animate-spin text-slate-400" />
              <p className="text-center text-[14px] font-medium text-slate-700">Создаём…</p>
            </motion.div>
          )}

          {status === "done" && previewUrl && (
            <motion.div
              className="mx-4 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between px-5 py-3">
                <p className="text-[13px] font-medium text-slate-500">
                  Нажмите и удерживайте, чтобы сохранить в Фото
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Закрыть"
                  className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto">
                <img src={previewUrl} alt="Кешбэки" className="w-full" />
              </div>
            </motion.div>
          )}

          {status === "done" && !previewUrl && (
            <motion.div
              className="flex w-44 flex-col items-center gap-4 rounded-3xl bg-white px-6 py-7 shadow-xl"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-7 w-7 text-green-600" strokeWidth={3} />
              </div>
              <p className="text-center text-[14px] font-medium text-slate-700">Файл сохранён</p>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              className="flex w-56 flex-col items-center gap-4 rounded-3xl bg-white px-6 py-7 shadow-xl"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <X className="h-7 w-7 text-red-600" />
              </div>
              <p className="text-center text-[14px] font-medium text-slate-700">
                Не удалось создать изображение
              </p>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Add to Home Screen overlay                                          */
/* ------------------------------------------------------------------ */

function HomeScreenSteps({ platform }: { platform: MobilePlatform }) {
  if (platform === "ios") {
    return (
      <ol className="mt-4 space-y-3 text-[14px] leading-relaxed text-slate-600">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
            1
          </span>
          <span>
            Нажмите <strong className="font-semibold text-slate-800">«Поделиться»</strong> внизу Safari.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
            2
          </span>
          <span>
            Выберите <strong className="font-semibold text-slate-800">«На экран Домой»</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
            3
          </span>
          <span>Нажмите <strong className="font-semibold text-slate-800">«Добавить»</strong>.</span>
        </li>
      </ol>
    )
  }

  if (platform === "android") {
    return (
      <ol className="mt-4 space-y-3 text-[14px] leading-relaxed text-slate-600">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
            1
          </span>
          <span>
            Нажмите <strong className="font-semibold text-slate-800">«Установить приложение»</strong>{" "}
            ниже или откройте меню браузера (⋮).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
            2
          </span>
          <span>
            Выберите{" "}
            <strong className="font-semibold text-slate-800">
              «Установить» или «Добавить на главный экран»
            </strong>
            .
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
            3
          </span>
          <span>Ярлык откроет cashbackbrain.ru без адресной строки.</span>
        </li>
      </ol>
    )
  }

  return (
    <ol className="mt-4 space-y-3 text-[14px] leading-relaxed text-slate-600">
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
          1
        </span>
        <span>
          Нажмите <strong className="font-semibold text-slate-800">«Установить приложение»</strong>{" "}
          ниже или значок установки в адресной строке Chrome.
        </span>
      </li>
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-[12px] font-bold text-slate-800">
          2
        </span>
        <span>На рабочем столе появится ярлык CashbackBrain.</span>
      </li>
    </ol>
  )
}

export function AddToHomeScreenOverlay({
  open,
  onClose,
  canPromptInstall,
  onInstall,
  isStandalone,
}: {
  open: boolean
  onClose: () => void
  canPromptInstall: boolean
  onInstall: () => Promise<boolean>
  isStandalone: boolean
}) {
  const [isInstalling, setIsInstalling] = useState(false)
  const platform = getMobilePlatform()

  async function handleInstall() {
    setIsInstalling(true)
    try {
      const accepted = await onInstall()
      if (accepted) {
        onClose()
      }
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-8 pt-3 shadow-xl sm:rounded-3xl sm:p-6"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-200">
                  <Smartphone className="h-5 w-5 text-slate-800" />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold text-slate-900">На экран «Домой»</h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">Ярлык cashbackbrain.ru</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isStandalone ? (
              <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-[14px] text-green-800">
                Приложение уже добавлено на экран «Домой».
              </div>
            ) : (
              <>
                <HomeScreenSteps platform={platform} />
                {canPromptInstall && (
                  <button
                    type="button"
                    onClick={() => void handleInstall()}
                    disabled={isInstalling}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-300 px-5 py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-400 disabled:opacity-60"
                  >
                    {isInstalling ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="h-5 w-5" />
                    )}
                    {isInstalling ? "Устанавливаем…" : "Установить приложение"}
                  </button>
                )}
                <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
                  <Share className="mt-0.5 h-4 w-4 shrink-0" />
                  После установки сайт откроется как отдельное приложение с иконкой «%».
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
