"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { AppLogo } from "@/components/app-logo"
import {
  Settings,
  User,
  CreditCard,
  MessageSquare,
  Info,
  LogIn,
  LogOut,
  ChevronLeft,
  X,
  Bell,
  Star,
  Check,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { labelsEquivalent } from "@/lib/category-label"
import { formatSaveMetaLine } from "@/lib/saved-matrix-meta"
import type { SavedMatrixSummary } from "@/lib/saved-matrices"
import type { MatrixState } from "@/lib/types"

type View = "menu" | "profile" | "cashback" | "feedback" | "about"

const CASHBACK_CATEGORIES = [
  "Кафе и рестораны",
  "Супермаркеты",
  "Аптеки",
  "Одежда и обувь",
  "Фастфуд",
  "Товары для детей",
  "Транспорт и такси",
  "АЗС и топливо",
  "Развлечения",
  "Путешествия",
] as const

function collectMatrixLabels(matrix: MatrixState): string[] {
  const labels: string[] = []
  for (const part of [matrix.bank, matrix.market]) {
    if (!part) continue
    for (const row of part.rows) {
      labels.push(row.category)
      if (row.canonicalCategory) labels.push(row.canonicalCategory)
      if (row.parent) labels.push(row.parent)
    }
  }
  return labels
}

function isCategoryInMatrix(cat: string, matrixLabels: string[]): boolean {
  return matrixLabels.some((label) => labelsEquivalent(cat, label))
}

function sortCategoriesForProfile(
  categories: readonly string[],
  matrix?: MatrixState | null,
): string[] {
  if (!matrix?.bank && !matrix?.market) return [...categories]

  const matrixLabels = collectMatrixLabels(matrix)
  const inMatrix: string[] = []
  const notInMatrix: string[] = []

  for (const cat of categories) {
    if (isCategoryInMatrix(cat, matrixLabels)) {
      inMatrix.push(cat)
    } else {
      notInMatrix.push(cat)
    }
  }

  return [...inMatrix, ...notInMatrix]
}

const AUTHENTICATED_MENU_ITEMS: { key: View; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Профиль", icon: User },
  { key: "cashback", label: "Кешбэк-профиль", icon: CreditCard },
  { key: "feedback", label: "Обратная связь", icon: MessageSquare },
  { key: "about", label: "О приложении", icon: Info },
]

const GUEST_MENU_ITEMS: { key: View; label: string; icon: typeof MessageSquare }[] = [
  { key: "feedback", label: "Обратная связь", icon: MessageSquare },
  { key: "about", label: "О приложении", icon: Info },
]

export function UserMenu({
  onLogout,
  onLoginRequest,
  isGuest = false,
  userEmail,
  variant = "light",
  savedSummaries = [],
  savesLoading = false,
  savesError = null,
  onOpenSaved,
  onDeleteSaved,
  onNewAssembly,
  onRetrySaves,
  matrix,
}: {
  onLogout: () => void
  onLoginRequest?: () => void
  isGuest?: boolean
  userEmail?: string
  variant?: "light" | "overlay"
  savedSummaries?: SavedMatrixSummary[]
  savesLoading?: boolean
  savesError?: string | null
  onOpenSaved?: (id: string) => void
  onDeleteSaved?: (id: string) => void
  onNewAssembly?: () => void
  onRetrySaves?: () => void
  matrix?: MatrixState | null
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>("menu")
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const portalContainerRef = useRef<Element | null>(null)
  const [portalMounted, setPortalMounted] = useState(false)

  useEffect(() => {
    portalContainerRef.current =
      document.getElementById("cashback-phone-root") ?? document.body
    setPortalMounted(true)
  }, [])

  const [name, setName] = useState("Пользователь")
  const [email, setEmail] = useState(userEmail ?? "")
  const [notifications, setNotifications] = useState(true)

  useEffect(() => {
    if (!userEmail) return
    setEmail(userEmail)
    const localPart = userEmail.split("@")[0] ?? "Пользователь"
    setName(localPart.charAt(0).toUpperCase() + localPart.slice(1))
  }, [userEmail])

  // Cashback profile state — all categories selected by default
  const [preferred, setPreferred] = useState<string[]>(() => [...CASHBACK_CATEGORIES])

  const sortedCategories = useMemo(
    () => sortCategoriesForProfile(CASHBACK_CATEGORIES, matrix),
    [matrix],
  )

  // Feedback state
  const [rating, setRating] = useState(0)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSent, setFeedbackSent] = useState(false)

  function openMenu() {
    setView("menu")
    setOpen(true)
  }

  function close() {
    setOpen(false)
    // reset transient feedback state after the sheet animates away
    setTimeout(() => {
      setView("menu")
      setFeedbackSent(false)
    }, 250)
  }

  function toggleCategory(cat: string) {
    setPreferred((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  function submitFeedback() {
    setFeedbackSent(true)
  }

  function openSaved(id: string) {
    close()
    onOpenSaved?.(id)
  }

  function handleNewAssembly() {
    close()
    onNewAssembly?.()
  }

  const titles: Record<View, string> = {
    menu: "Настройки",
    profile: "Профиль",
    cashback: "Кешбэк-профиль",
    feedback: "Обратная связь",
    about: "О приложении",
  }

  const triggerClasses =
    variant === "overlay"
      ? "bg-white/85 text-slate-700 shadow-sm backdrop-blur hover:bg-white"
      : "bg-slate-100 text-slate-600 hover:bg-slate-200"

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        aria-label="Открыть меню"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95 ${triggerClasses}`}
      >
        <Settings className="h-5 w-5" />
      </button>

      {portalMounted && portalContainerRef.current && createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm cursor-pointer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={titles[view]}
              className="flex max-h-[88%] flex-col rounded-t-3xl bg-white pb-8 pt-3"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" />

              {/* Header */}
              <div className="mb-2 flex items-center gap-2 px-5">
                {view !== "menu" && (
                  <button
                    type="button"
                    onClick={() => setView("menu")}
                    aria-label="Назад"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <h2 className="flex-1 text-[17px] font-semibold text-slate-900">
                  {titles[view]}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Закрыть"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={view}
                    initial={{ opacity: 0, x: view === "menu" ? -12 : 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {view === "menu" && (
                      <div className="pt-2">
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                          {(isGuest ? GUEST_MENU_ITEMS : AUTHENTICATED_MENU_ITEMS).map(
                            (item, idx, items) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setView(item.key)}
                              className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 ${
                                idx !== items.length - 1
                                  ? "border-b border-slate-100"
                                  : ""
                              }`}
                            >
                              <item.icon className="h-5 w-5 shrink-0 text-slate-500" />
                              <span className="flex-1 text-[15px] font-medium text-slate-800">
                                {item.label}
                              </span>
                              <ChevronLeft className="h-4 w-4 shrink-0 rotate-180 text-slate-300" />
                            </button>
                          ),
                          )}
                        </div>

                        {isGuest ? (
                          <button
                            type="button"
                            onClick={() => {
                              close()
                              onLoginRequest?.()
                            }}
                            className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3.5 text-left transition-colors hover:bg-yellow-100 active:bg-yellow-200"
                          >
                            <LogIn className="h-5 w-5 shrink-0 text-slate-700" />
                            <span className="text-[15px] font-medium text-slate-800">
                              Войти / создать аккаунт
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowLogoutConfirm(true)}
                            className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-red-200 px-4 py-3.5 text-left transition-colors hover:bg-red-50 active:bg-red-100"
                          >
                            <LogOut className="h-5 w-5 shrink-0 text-red-600" />
                            <span className="text-[15px] font-medium text-red-600">Выйти</span>
                          </button>
                        )}
                      </div>
                    )}

                    {view === "profile" && (
                      <div className="flex flex-col gap-4 pt-2">
                        <div className="flex flex-col items-center gap-3 pb-2">
                          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-200 text-2xl font-bold text-slate-800">
                            {name
                              .split(" ")
                              .map((p) => p[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                        </div>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-medium text-slate-500">Имя</span>
                          <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="rounded-xl border border-slate-200 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-slate-400"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-medium text-slate-500">Email</span>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="rounded-xl border border-slate-200 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-slate-400"
                          />
                        </label>

                        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Bell className="h-5 w-5 text-slate-500" />
                            <span className="text-[15px] font-medium text-slate-800">
                              Уведомления
                            </span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={notifications}
                            onClick={() => setNotifications((v) => !v)}
                            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                              notifications ? "bg-green-500" : "bg-slate-300"
                            }`}
                          >
                            <motion.span
                              layout
                              transition={{ type: "spring", stiffness: 500, damping: 32 }}
                              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${
                                notifications ? "right-0.5" : "left-0.5"
                              }`}
                            />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setView("menu")}
                          className="mt-1 w-full rounded-2xl bg-yellow-200 px-5 py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300 active:bg-yellow-400"
                        >
                          Сохранить
                        </button>
                      </div>
                    )}

                    {view === "cashback" && (
                      <div className="flex flex-col gap-5 pt-2">
                        <div>
                          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                            Сохранённые результаты
                          </h3>
                          {savesLoading ? (
                            <div className="space-y-2">
                              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
                              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
                            </div>
                          ) : savesError ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                              <p className="text-[13px] text-red-700">{savesError}</p>
                              {onRetrySaves && (
                                <button
                                  type="button"
                                  onClick={onRetrySaves}
                                  className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-red-700"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Повторить
                                </button>
                              )}
                            </div>
                          ) : savedSummaries.length === 0 ? (
                            <p className="text-[14px] leading-relaxed text-slate-500">
                              Пока нет сохранений. Соберите кешбэки и нажмите «Сохранить результат» на
                              экране итогов.
                            </p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {savedSummaries.map((save) => (
                                <div key={save.id} className="flex items-stretch gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openSaved(save.id)}
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-yellow-300 hover:bg-yellow-50 active:bg-yellow-100"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="truncate text-[14px] font-semibold text-slate-900">
                                        {save.title}
                                      </p>
                                      {save.isFavorite && (
                                        <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                                      )}
                                    </div>
                                    <p className="mt-1 text-[12px] text-slate-500">
                                      {formatSaveMetaLine(save)}
                                    </p>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Удалить"
                                    onClick={() => setDeleteConfirmId(save.id)}
                                    className="flex shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 px-3 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600 active:bg-red-200"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                            Любимые категории
                          </h3>
                          <p className="mb-3 text-[14px] leading-relaxed text-slate-500">
                            Отметьте категории, в которых вы чаще покупаете — мы будем подсказывать лучшие
                            ставки именно для них.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {sortedCategories.map((cat) => {
                              const active = preferred.includes(cat)
                              return (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => toggleCategory(cat)}
                                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                                    active
                                      ? "border-yellow-300 bg-yellow-200 text-slate-900"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  {active && <Check className="h-3.5 w-3.5" />}
                                  {cat}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {onNewAssembly && (
                          <button
                            type="button"
                            onClick={handleNewAssembly}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-[15px] font-semibold text-slate-800 transition-colors hover:bg-slate-50 active:bg-slate-100"
                          >
                            + Новая сборка
                          </button>
                        )}
                      </div>
                    )}

                    {view === "feedback" && (
                      <div className="flex flex-col gap-4 pt-2">
                        {feedbackSent ? (
                          <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                              <Check className="h-8 w-8 text-green-600" strokeWidth={3} />
                            </span>
                            <p className="text-[16px] font-semibold text-slate-900">
                              Спасибо за отзыв!
                            </p>
                            <p className="text-[14px] text-slate-500">
                              Мы учтём ваше мнение в следующих обновлениях.
                            </p>
                            <button
                              type="button"
                              onClick={() => setView("menu")}
                              className="mt-2 w-full rounded-2xl bg-slate-100 px-5 py-3 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-200"
                            >
                              Готово
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col items-center gap-2">
                              <span className="text-[14px] font-medium text-slate-600">
                                Оцените приложение
                              </span>
                              <div className="flex items-center gap-1.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    aria-label={`Оценка ${star}`}
                                    onClick={() => setRating(star)}
                                    className="transition-transform active:scale-90"
                                  >
                                    <Star
                                      className={`h-8 w-8 ${
                                        star <= rating
                                          ? "fill-yellow-400 text-yellow-400"
                                          : "fill-slate-100 text-slate-300"
                                      }`}
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[13px] font-medium text-slate-500">
                                Ваш отзыв
                              </span>
                              <textarea
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                rows={4}
                                placeholder="Что можно улучшить?"
                                className="resize-none rounded-xl border border-slate-200 px-4 py-3 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={rating === 0}
                              onClick={submitFeedback}
                              className="w-full rounded-2xl bg-yellow-200 px-5 py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-yellow-300 active:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Отправить
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {view === "about" && (
                      <div className="flex flex-col gap-4 pt-2">
                        <div className="flex flex-col items-center gap-3 py-4">
                          <AppLogo size="md" />
                          <div className="text-center">
                            <p className="text-[16px] font-semibold text-slate-900">CashbackBrain</p>
                            <p className="text-[13px] text-slate-500">Версия 1.0.0</p>
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                            <span className="text-[14px] text-slate-500">Версия</span>
                            <span className="text-[14px] font-medium text-slate-800">1.0.0</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                            <span className="text-[14px] text-slate-500">Сборка</span>
                            <span className="text-[14px] font-medium text-slate-800">2026.06</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-3.5">
                            <span className="text-[14px] text-slate-500">Лицензия</span>
                            <span className="text-[14px] font-medium text-slate-800">MIT</span>
                          </div>
                        </div>
                        <p className="text-center text-[13px] leading-relaxed text-slate-400">
                          Собирайте кешбэк-категории из банков и магазинов в одном месте.
                          {"\n"}© 2026 Кешбэки. Все права защищены.
                        </p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      , portalContainerRef.current)}

      {/* Delete save confirmation */}
      {portalMounted && portalContainerRef.current && createPortal(
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            className="absolute inset-0 z-[60] flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 cursor-pointer bg-slate-900/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-save-title"
              aria-describedby="delete-save-desc"
              className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              <h2 id="delete-save-title" className="text-lg font-bold text-slate-900">
                Удалить результат?
              </h2>
              <p id="delete-save-desc" className="mt-2 text-[14px] leading-relaxed text-slate-500">
                Это действие нельзя отменить. Сохранённый результат будет удалён без возможности восстановления.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSaved?.(deleteConfirmId)
                    setDeleteConfirmId(null)
                  }}
                  className="w-full rounded-2xl bg-red-600 px-5 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800"
                >
                  Удалить
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="w-full rounded-2xl bg-slate-100 px-5 py-3.5 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 active:bg-slate-300"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      , portalContainerRef.current)}

      {/* Logout confirmation */}
      {portalMounted && portalContainerRef.current && createPortal(
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            className="absolute inset-0 z-[60] flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 cursor-pointer bg-slate-900/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutConfirm(false)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="logout-title"
              aria-describedby="logout-desc"
              className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              <h2 id="logout-title" className="text-lg font-bold text-slate-900">
                Выйти из аккаунта?
              </h2>
              <p id="logout-desc" className="mt-2 text-[14px] leading-relaxed text-slate-500">
                Все локальные данные будут удалены, и вы вернётесь на начальный экран. Продолжить?
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false)
                    setOpen(false)
                    onLogout()
                  }}
                  className="w-full rounded-2xl bg-red-600 px-5 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800"
                >
                  Выйти
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full rounded-2xl bg-slate-100 px-5 py-3.5 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-200 active:bg-slate-300"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      , portalContainerRef.current)}
    </>
  )
}
