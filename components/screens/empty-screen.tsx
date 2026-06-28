"use client"

import { motion } from "framer-motion"
import { AppLogo } from "@/components/app-logo"
import { ImageFilePicker } from "@/components/image-file-picker"
import { UserMenu } from "./user-menu"

export function EmptyScreen({
  onFilePicked,
  onLogout,
  onLoginRequest,
  isGuest,
  userEmail,
}: {
  onFilePicked: (src: string) => void
  onLogout: () => void
  onLoginRequest: () => void
  isGuest: boolean
  userEmail?: string
}) {
  return (
    <ImageFilePicker onPick={onFilePicked}>
      {(openPicker, { isReading, error }) => (
        <motion.div
          key="empty"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative flex min-h-full flex-col px-6 py-6"
        >
          <div className="flex justify-end">
            <UserMenu
              onLogout={onLogout}
              onLoginRequest={onLoginRequest}
              isGuest={isGuest}
              userEmail={userEmail}
            />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="-mx-6 mb-6 w-[calc(100%+3rem)]">
              <img
                src="/images/empty-cashback.png"
                alt="Иллюстрация: руки и категории кешбэка"
                className="mx-auto h-auto w-full max-h-[min(52vw,240px)] object-contain object-center sm:max-h-[260px]"
              />
            </div>

            <AppLogo showName className="mb-4 justify-center" />

            <h1 className="text-balance text-2xl font-bold leading-tight text-slate-900">
              Соберите кешбэки в одном месте
            </h1>
            <p className="mt-3 text-pretty text-[15px] leading-relaxed text-slate-500">
              Загрузите скриншоты категорий из банков и магазинов
            </p>

            <div className="mt-10 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={openPicker}
                disabled={isReading}
                className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-yellow-200 px-5 py-4 text-slate-900 shadow-sm transition-colors hover:bg-yellow-300 active:bg-yellow-400 disabled:opacity-60"
              >
                <span className="text-[15px] font-semibold">
                  {isReading ? "Загрузка…" : "Выбрать скриншоты"}
                </span>
                <span className="text-[13px] font-medium text-slate-700">
                  Сбер, Т-Банк, Магнит, Пятерочка и другие
                </span>
              </button>

              {isGuest && (
                <button
                  type="button"
                  onClick={onLoginRequest}
                  className="text-[14px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  Войти, чтобы сохранить результат
                </button>
              )}

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </ImageFilePicker>
  )
}
