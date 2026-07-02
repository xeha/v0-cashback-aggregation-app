"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { ImageFilePicker } from "@/components/image-file-picker"
import { AuthScreen } from "@/components/screens/auth-screen"
import { BankSelectScreen } from "@/components/screens/bank-select-screen"
import { EmptyScreen } from "@/components/screens/empty-screen"
import { GalleryScreen } from "@/components/screens/gallery-screen"
import { ProcessingScreen } from "@/components/screens/processing-screen"
import { ResultsScreen } from "@/components/screens/results-screen"
import {
  submissionToBankSelectRow,
  type BankSelectInitialRow,
} from "@/lib/bank-select-rows"
import {
  cashbackPeriodFromSaved,
  formatCashbackPeriod,
  getDefaultCashbackPeriod,
} from "@/lib/cashback-period"
import { useAuth } from "@/lib/auth-context"
import {
  deleteSavedMatrix,
  getSavedMatrix,
  listSavedMatrices,
  saveMatrix,
  updateSavedMatrix,
  type SavedMatrixRecord,
  type SavedMatrixSummary,
} from "@/lib/saved-matrices"
import type {
  CashbackPeriod,
  ImagePickResult,
  Kind,
  MatrixState,
  ProcessingSummary,
  SourceSubmission,
} from "@/lib/types"

type Screen = "empty" | "gallery" | "bank-select" | "processing" | "results"

type PickMode = "upload-more" | "replace" | "new-scan"

const EMPTY_PROCESSING_SUMMARY: ProcessingSummary = {
  skipped: [],
  lowConfidence: [],
  bankOffers: [],
}

function resetState() {
  return {
    currentScreen: "empty" as Screen,
    kind: "bank" as Kind,
    cashbackPeriod: getDefaultCashbackPeriod() as CashbackPeriod,
    initialShot: "",
    fileModifiedBySrc: {} as Record<string, number>,
    galleryPrefillSrc: null as string | null,
    submissions: [] as SourceSubmission[],
    matrix: { bank: null, market: null } as MatrixState,
    processingError: null as string | null,
    processingSummary: EMPTY_PROCESSING_SUMMARY,
    bankSelectDraft: [] as SourceSubmission[],
    savedSubmissions: [] as SourceSubmission[],
    bankSelectSession: 0,
    isReplacingScreenshot: false,
    isAddingMore: false,
  }
}

function getBankSelectInitialRows({
  isReplacingScreenshot,
  isAddingMore,
  initialShot,
  savedSubmissions,
  bankSelectDraft,
}: {
  isReplacingScreenshot: boolean
  isAddingMore: boolean
  initialShot: string
  savedSubmissions: SourceSubmission[]
  bankSelectDraft: SourceSubmission[]
}): BankSelectInitialRow[] | undefined {
  if ((isReplacingScreenshot || isAddingMore) && initialShot) {
    return [
      ...savedSubmissions.map(submissionToBankSelectRow),
      {
        providerName: "",
        screenshotSrc: initialShot,
        kind: null,
        catalogSlug: null,
      },
    ]
  }

  if (bankSelectDraft.length > 0) {
    return bankSelectDraft.map(submissionToBankSelectRow)
  }

  return undefined
}

export function CashbackApp() {
  const { user, isLoading, logout, pb } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<Screen>("empty")
  const [kind, setKind] = useState<Kind>("bank")
  const [cashbackPeriod, setCashbackPeriod] = useState<CashbackPeriod>(getDefaultCashbackPeriod())
  const [initialShot, setInitialShot] = useState("")
  const [fileModifiedBySrc, setFileModifiedBySrc] = useState<Record<string, number>>({})
  const [galleryPrefillSrc, setGalleryPrefillSrc] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<SourceSubmission[]>([])
  const [matrix, setMatrix] = useState<MatrixState>({ bank: null, market: null })
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [processingSummary, setProcessingSummary] = useState<ProcessingSummary>(
    EMPTY_PROCESSING_SUMMARY,
  )
  const [bankSelectDraft, setBankSelectDraft] = useState<SourceSubmission[]>([])
  const [savedSubmissions, setSavedSubmissions] = useState<SourceSubmission[]>([])
  const [bankSelectSession, setBankSelectSession] = useState(0)
  const [isReplacingScreenshot, setIsReplacingScreenshot] = useState(false)
  const [isAddingMore, setIsAddingMore] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false)
  const [activeSaveId, setActiveSaveId] = useState<string | null>(null)
  const [savedSummaries, setSavedSummaries] = useState<SavedMatrixSummary[]>([])
  const [savesLoading, setSavesLoading] = useState(false)
  const [savesError, setSavesError] = useState<string | null>(null)
  const [openSaveError, setOpenSaveError] = useState<string | null>(null)
  const pickModeRef = useRef<PickMode | null>(null)
  const openGlobalPickerRef = useRef<(() => void) | null>(null)

  const isGuest = !user
  const continueSave = savedSummaries[0] ?? null

  function openAuth() {
    setAuthOpen(true)
  }

  async function refreshSavedSummaries() {
    if (!user) {
      setSavedSummaries([])
      setSavesError(null)
      return
    }

    setSavesLoading(true)
    setSavesError(null)

    try {
      const summaries = await listSavedMatrices(pb)
      setSavedSummaries(summaries)
    } catch {
      setSavedSummaries([])
      setSavesError("Не удалось загрузить список")
    } finally {
      setSavesLoading(false)
    }
  }

  function hydrateFromSave(record: SavedMatrixRecord) {
    setActiveSaveId(record.id)
    setMatrix({ bank: record.bank_matrix, market: record.market_matrix })
    setSubmissions(record.submissions)
    setProcessingSummary(record.summary)
    setCashbackPeriod(cashbackPeriodFromSaved(record.periodMonth, record.periodYear))
    setBankSelectDraft(record.submissions)
    setProcessingError(null)
    setSavedSubmissions([])
    setIsReplacingScreenshot(false)
    setIsAddingMore(false)
    setCurrentScreen("results")
  }

  async function handleOpenSaved(id: string) {
    setOpenSaveError(null)

    try {
      const record = await getSavedMatrix(pb, id)
      hydrateFromSave(record)
    } catch {
      setOpenSaveError("Не удалось открыть сохранение")
    }
  }

  async function handleDeleteSaved(id: string) {
    try {
      await deleteSavedMatrix(pb, id)
      setSavedSummaries((prev) => prev.filter((s) => s.id !== id))
      if (activeSaveId === id) setActiveSaveId(null)
    } catch {
      // silently ignore — user stays in current state
    }
  }

  async function handleSaveMatrix(): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
    const hasBank = (matrix.bank?.providers.length ?? 0) > 0
    const hasMarket = (matrix.market?.providers.length ?? 0) > 0
    const kindLabel =
      hasBank && hasMarket ? "Кешбэк" : hasBank ? "Банки" : "Маркетплейсы"
    const { month, year } = cashbackPeriod
    const title = `${kindLabel} ${month}.${year}`

    const payload = {
      matrix,
      submissions,
      summary: processingSummary,
      period: cashbackPeriod,
      title,
    }

    try {
      if (activeSaveId) {
        await updateSavedMatrix(pb, activeSaveId, payload)
        await refreshSavedSummaries()
        return { ok: true, message: "Изменения сохранены" }
      }

      const created = await saveMatrix(pb, payload)
      const createdId = typeof created.id === "string" ? created.id : null
      if (createdId) {
        setActiveSaveId(createdId)
      }
      await refreshSavedSummaries()
      return { ok: true, message: "Результат сохранён" }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось сохранить",
      }
    }
  }

  useEffect(() => {
    if (user && authOpen) {
      setAuthOpen(false)
    }
  }, [user, authOpen])

  useEffect(() => {
    void refreshSavedSummaries()
  }, [user, pb])

  useEffect(() => {
    if (!openSaveError) return
    const timer = window.setTimeout(() => setOpenSaveError(null), 3000)
    return () => window.clearTimeout(timer)
  }, [openSaveError])

  function handleRestart() {
    const next = resetState()
    setCurrentScreen(next.currentScreen)
    setKind(next.kind)
    setCashbackPeriod(next.cashbackPeriod)
    setInitialShot(next.initialShot)
    setFileModifiedBySrc(next.fileModifiedBySrc)
    setGalleryPrefillSrc(next.galleryPrefillSrc)
    setSubmissions(next.submissions)
    setMatrix(next.matrix)
    setProcessingError(next.processingError)
    setProcessingSummary(next.processingSummary)
    setBankSelectDraft(next.bankSelectDraft)
    setSavedSubmissions(next.savedSubmissions)
    setBankSelectSession(next.bankSelectSession)
    setIsReplacingScreenshot(next.isReplacingScreenshot)
    setIsAddingMore(next.isAddingMore)
    setActiveSaveId(null)
    pickModeRef.current = null
  }

  function registerFilePick(result: ImagePickResult) {
    setFileModifiedBySrc((prev) => ({
      ...prev,
      [result.dataUrl]: result.fileModifiedAt,
    }))
    return result.dataUrl
  }

  function goToBankSelectWithShot(src: string) {
    setInitialShot(src)
    if (!isReplacingScreenshot && !isAddingMore) {
      setBankSelectDraft([])
      setSavedSubmissions([])
    }
    setBankSelectSession((value) => value + 1)
    setCurrentScreen("bank-select")
  }

  function handleGlobalFilePicked(result: ImagePickResult) {
    const src = registerFilePick(result)
    const mode = pickModeRef.current
    pickModeRef.current = null

    if (mode === "upload-more") {
      setSavedSubmissions(submissions)
      setIsAddingMore(true)
      setInitialShot(src)
      setBankSelectSession((value) => value + 1)
      setCurrentScreen("bank-select")
      return
    }

    if (mode === "replace") {
      setProcessingError(null)
      setIsReplacingScreenshot(true)
      setInitialShot(src)
      setBankSelectSession((value) => value + 1)
      setCurrentScreen("bank-select")
      return
    }

    if (mode === "new-scan") {
      setActiveSaveId(null)
      setInitialShot(src)
      setGalleryPrefillSrc(src)
      setCurrentScreen("gallery")
    }
  }

  function handleRestartAndPick() {
    handleRestart()
    pickModeRef.current = "new-scan"
    openGlobalPickerRef.current?.()
  }

  const bankSelectInitialRows = getBankSelectInitialRows({
    isReplacingScreenshot,
    isAddingMore,
    initialShot,
    savedSubmissions,
    bankSelectDraft,
  })

  function handleLogout() {
    logout()
    handleRestart()
  }

  const lockedRowCount =
    isReplacingScreenshot || isAddingMore ? savedSubmissions.length : 0

  const savedMenuProps = {
    savedSummaries,
    savesLoading,
    savesError,
    onOpenSaved: handleOpenSaved,
    onDeleteSaved: handleDeleteSaved,
    onRetrySaves: refreshSavedSummaries,
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100 sm:py-8">
      <div id="cashback-phone-root" className="relative flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-[844px] sm:max-w-[400px] sm:rounded-[2.5rem] sm:shadow-2xl">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-yellow-400" />
          </div>
        ) : (
          <>
          <ImageFilePicker
            onPick={handleGlobalFilePicked}
            onDismiss={() => {
              pickModeRef.current = null
            }}
          >
            {(openGlobalPicker) => {
              openGlobalPickerRef.current = openGlobalPicker
              return (
              <div className="relative flex h-full flex-col overflow-hidden">
                <div className="relative flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait">
                {currentScreen === "empty" && (
                  <EmptyScreen
                    isGuest={isGuest}
                    onLoginRequest={openAuth}
                    onFilePicked={(result) => {
                      setActiveSaveId(null)
                      const src = registerFilePick(result)
                      setInitialShot(src)
                      setGalleryPrefillSrc(src)
                      setCurrentScreen("gallery")
                    }}
                    onLogout={handleLogout}
                    userEmail={typeof user?.email === "string" ? user.email : undefined}
                    continueSave={continueSave}
                    onContinueSave={handleOpenSaved}
                    savesLoading={savesLoading}
                    {...savedMenuProps}
                  />
                )}
                {currentScreen === "gallery" && (
                  <GalleryScreen
                    kind={kind}
                    initialSrc={galleryPrefillSrc}
                    onScreenshotPicked={registerFilePick}
                    onCancel={() => {
                      setGalleryPrefillSrc(null)
                      if (isReplacingScreenshot) {
                        setIsReplacingScreenshot(false)
                        setCurrentScreen("processing")
                        return
                      }
                      if (isAddingMore) {
                        setIsAddingMore(false)
                        setSavedSubmissions([])
                        setCurrentScreen("results")
                        return
                      }
                      setCurrentScreen("empty")
                    }}
                    onAdd={(src) => {
                      setGalleryPrefillSrc(null)
                      goToBankSelectWithShot(src)
                    }}
                  />
                )}
                {currentScreen === "bank-select" && (
                  <BankSelectScreen
                    key={`bank-select-${bankSelectSession}`}
                    kind={kind}
                    initialShot={initialShot}
                    initialRows={bankSelectInitialRows}
                    lockedRowCount={lockedRowCount}
                    cashbackPeriod={cashbackPeriod}
                    onCashbackPeriodChange={setCashbackPeriod}
                    fileModifiedBySrc={fileModifiedBySrc}
                    onScreenshotPicked={registerFilePick}
                    onBack={() => {
                      if (isReplacingScreenshot) {
                        setIsReplacingScreenshot(false)
                        setInitialShot("")
                        setCurrentScreen("processing")
                        return
                      }
                      if (isAddingMore) {
                        setIsAddingMore(false)
                        setSavedSubmissions([])
                        setCurrentScreen("results")
                        return
                      }
                      setGalleryPrefillSrc(initialShot || null)
                      setCurrentScreen("gallery")
                    }}
                    onNext={(nextSubmissions) => {
                      setProcessingError(null)
                      if (isReplacingScreenshot) {
                        const newSubmissions = nextSubmissions.slice(savedSubmissions.length)
                        if (newSubmissions.length === 0) {
                          setIsReplacingScreenshot(false)
                          setCurrentScreen("processing")
                          return
                        }
                        setSubmissions((prev) => [...newSubmissions, ...prev])
                        setBankSelectDraft([...savedSubmissions, ...newSubmissions])
                        setIsReplacingScreenshot(false)
                      } else if (isAddingMore) {
                        const newSubmissions = nextSubmissions.slice(savedSubmissions.length)
                        if (newSubmissions.length === 0) {
                          setIsAddingMore(false)
                          setSavedSubmissions([])
                          setCurrentScreen("results")
                          return
                        }
                        setSubmissions(newSubmissions)
                        setBankSelectDraft(nextSubmissions)
                        setIsAddingMore(false)
                      } else {
                        setActiveSaveId(null)
                        setProcessingSummary(EMPTY_PROCESSING_SUMMARY)
                        setBankSelectDraft(nextSubmissions)
                        setSubmissions(nextSubmissions)
                      }
                      setCurrentScreen("processing")
                    }}
                  />
                )}
                {currentScreen === "processing" && (
                  <ProcessingScreen
                    submissions={submissions}
                    existingMatrix={matrix}
                    initialError={processingError}
                    onBack={() => setCurrentScreen("bank-select")}
                    onOcrFailure={(partialMatrix, failedIndex, partialSummary, processedSubmissions) => {
                      setMatrix(partialMatrix)
                      setSavedSubmissions((prev) => [...prev, ...processedSubmissions])
                      setSubmissions((prev) => prev.slice(failedIndex + 1))
                      setProcessingSummary((prev) => ({
                        skipped: prev.skipped,
                        lowConfidence: [...prev.lowConfidence, ...partialSummary.lowConfidence],
                        bankOffers: [...prev.bankOffers, ...partialSummary.bankOffers],
                      }))
                    }}
                    onGeneralFailure={(partialMatrix, failedIndex, partialSummary, processedSubmissions) => {
                      setMatrix(partialMatrix)
                      setSavedSubmissions((prev) => [...prev, ...processedSubmissions])
                      setSubmissions((prev) => prev.slice(failedIndex))
                      setProcessingSummary((prev) => ({
                        skipped: prev.skipped,
                        lowConfidence: [...prev.lowConfidence, ...partialSummary.lowConfidence],
                        bankOffers: [...prev.bankOffers, ...partialSummary.bankOffers],
                      }))
                    }}
                    onReplaceScreenshot={() => {
                      pickModeRef.current = "replace"
                      openGlobalPicker()
                    }}
                    onDone={(nextMatrix, summary) => {
                      setMatrix(nextMatrix)
                      setProcessingSummary((prev) => ({
                        skipped: [...prev.skipped, ...summary.skipped],
                        lowConfidence: [...prev.lowConfidence, ...summary.lowConfidence],
                        bankOffers: [...prev.bankOffers, ...summary.bankOffers],
                      }))
                      setProcessingError(null)
                      setSubmissions((current) =>
                        bankSelectDraft.length > current.length ? bankSelectDraft : current,
                      )
                      setSavedSubmissions([])
                      setCurrentScreen("results")
                    }}
                    onError={(message) => setProcessingError(message)}
                  />
                )}
                {currentScreen === "results" && (
                  <ResultsScreen
                    kind={kind}
                    cashbackPeriodLabel={formatCashbackPeriod(cashbackPeriod)}
                    matrix={matrix}
                    submissions={submissions}
                    processingSummary={processingSummary}
                    onRestart={handleRestart}
                    onLogout={handleLogout}
                    isGuest={isGuest}
                    onLoginRequest={openAuth}
                    showGuestSaveBanner={isGuest && !guestBannerDismissed}
                    onGuestSaveBannerDismiss={() => setGuestBannerDismissed(true)}
                    userEmail={typeof user?.email === "string" ? user.email : undefined}
                    activeSaveId={activeSaveId}
                    onSaveMatrix={handleSaveMatrix}
                    onUploadMore={() => {
                      pickModeRef.current = "upload-more"
                      openGlobalPicker()
                    }}
                    {...savedMenuProps}
                    onNewAssembly={handleRestartAndPick}
                  />
                )}
                  </AnimatePresence>
                </div>
              </div>
            )}}
          </ImageFilePicker>

          <AnimatePresence>
            {authOpen && (
              <motion.div
                key="auth-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 z-50 overflow-y-auto bg-white"
              >
                <AuthScreen onClose={() => setAuthOpen(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {openSaveError && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="pointer-events-none absolute inset-x-5 bottom-6 z-[60] rounded-2xl bg-red-600 px-4 py-3 text-center text-[14px] font-medium text-white shadow-lg"
              >
                {openSaveError}
              </motion.div>
            )}
          </AnimatePresence>
          </>
        )}
      </div>
    </main>
  )
}
