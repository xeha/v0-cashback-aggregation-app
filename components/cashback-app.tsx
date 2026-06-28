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
import { useAuth } from "@/lib/auth-context"
import type { Kind, MatrixState, ProcessingSummary, SourceSubmission } from "@/lib/types"

type Screen = "empty" | "gallery" | "bank-select" | "processing" | "results"

type PickMode = "upload-more" | "replace"

const EMPTY_PROCESSING_SUMMARY: ProcessingSummary = {
  skipped: [],
  lowConfidence: [],
  bankOffers: [],
}

function resetState() {
  return {
    currentScreen: "empty" as Screen,
    kind: "bank" as Kind,
    initialShot: "",
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
  const { user, isLoading, logout } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<Screen>("empty")
  const [kind, setKind] = useState<Kind>("bank")
  const [initialShot, setInitialShot] = useState("")
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
  const pickModeRef = useRef<PickMode | null>(null)

  const isGuest = !user

  function openAuth() {
    setAuthOpen(true)
  }

  useEffect(() => {
    if (user && authOpen) {
      setAuthOpen(false)
    }
  }, [user, authOpen])

  function handleRestart() {
    const next = resetState()
    setCurrentScreen(next.currentScreen)
    setKind(next.kind)
    setInitialShot(next.initialShot)
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
    pickModeRef.current = null
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

  function handleGlobalFilePicked(src: string) {
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
    }
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100 sm:py-8">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-[844px] sm:max-w-[400px] sm:rounded-[2.5rem] sm:shadow-2xl">
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
            {(openGlobalPicker) => (
              <div className="relative flex h-full flex-col overflow-hidden">
                <div className="relative flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait">
                {currentScreen === "empty" && (
                  <EmptyScreen
                    isGuest={isGuest}
                    onLoginRequest={openAuth}
                    onFilePicked={(src) => {
                      setInitialShot(src)
                      setGalleryPrefillSrc(src)
                      setCurrentScreen("gallery")
                    }}
                    onLogout={handleLogout}
                    userEmail={typeof user?.email === "string" ? user.email : undefined}
                  />
                )}
                {currentScreen === "gallery" && (
                  <GalleryScreen
                    kind={kind}
                    initialSrc={galleryPrefillSrc}
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
                        setSubmissions((prev) => [...newSubmissions, ...prev])
                        setBankSelectDraft([...savedSubmissions, ...newSubmissions])
                        setIsReplacingScreenshot(false)
                      } else if (isAddingMore) {
                        const newSubmissions = nextSubmissions.slice(savedSubmissions.length)
                        setSubmissions(newSubmissions)
                        setBankSelectDraft(nextSubmissions)
                        setIsAddingMore(false)
                      } else {
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
                    onUploadMore={() => {
                      pickModeRef.current = "upload-more"
                      openGlobalPicker()
                    }}
                  />
                )}
                  </AnimatePresence>
                </div>
              </div>
            )}
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
          </>
        )}
      </div>
    </main>
  )
}
