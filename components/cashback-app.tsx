"use client"

import { AnimatePresence } from "framer-motion"
import { useState } from "react"
import { BankSelectScreen } from "@/components/screens/bank-select-screen"
import { EmptyScreen } from "@/components/screens/empty-screen"
import { GalleryScreen } from "@/components/screens/gallery-screen"
import { ProcessingScreen } from "@/components/screens/processing-screen"
import { ResultsScreen } from "@/components/screens/results-screen"
import {
  submissionToBankSelectRow,
  type BankSelectInitialRow,
} from "@/lib/bank-select-rows"
import type { Kind, MatrixState, ProcessingSummary, SourceSubmission } from "@/lib/types"

type Screen = "empty" | "gallery" | "bank-select" | "processing" | "results"

const EMPTY_PROCESSING_SUMMARY: ProcessingSummary = {
  skipped: [],
  lowConfidence: [],
}

function resetState() {
  return {
    currentScreen: "empty" as Screen,
    kind: "bank" as Kind,
    initialShot: "",
    submissions: [] as SourceSubmission[],
    matrix: { bank: null, market: null } as MatrixState,
    processingError: null as string | null,
    processingSummary: EMPTY_PROCESSING_SUMMARY,
    bankSelectDraft: [] as SourceSubmission[],
    savedSubmissions: [] as SourceSubmission[],
    bankSelectSession: 0,
    isReplacingScreenshot: false,
  }
}

function getBankSelectInitialRows({
  isReplacingScreenshot,
  initialShot,
  savedSubmissions,
  bankSelectDraft,
}: {
  isReplacingScreenshot: boolean
  initialShot: string
  savedSubmissions: SourceSubmission[]
  bankSelectDraft: SourceSubmission[]
}): BankSelectInitialRow[] | undefined {
  if (isReplacingScreenshot && initialShot) {
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
  const [currentScreen, setCurrentScreen] = useState<Screen>("empty")
  const [kind, setKind] = useState<Kind>("bank")
  const [initialShot, setInitialShot] = useState("")
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

  function handleRestart() {
    const next = resetState()
    setCurrentScreen(next.currentScreen)
    setKind(next.kind)
    setInitialShot(next.initialShot)
    setSubmissions(next.submissions)
    setMatrix(next.matrix)
    setProcessingError(next.processingError)
    setProcessingSummary(next.processingSummary)
    setBankSelectDraft(next.bankSelectDraft)
    setSavedSubmissions(next.savedSubmissions)
    setBankSelectSession(next.bankSelectSession)
    setIsReplacingScreenshot(next.isReplacingScreenshot)
  }

  const bankSelectInitialRows = getBankSelectInitialRows({
    isReplacingScreenshot,
    initialShot,
    savedSubmissions,
    bankSelectDraft,
  })

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100 sm:py-8">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-[844px] sm:max-w-[400px] sm:rounded-[2.5rem] sm:shadow-2xl">
        <div className="relative flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {currentScreen === "empty" && (
              <EmptyScreen
                onUpload={(k) => {
                  setKind(k)
                  setCurrentScreen("gallery")
                }}
                onLogout={handleRestart}
              />
            )}
            {currentScreen === "gallery" && (
              <GalleryScreen
                kind={kind}
                onCancel={() => {
                  if (isReplacingScreenshot) {
                    setIsReplacingScreenshot(false)
                    setCurrentScreen("processing")
                    return
                  }
                  setCurrentScreen("empty")
                }}
                onAdd={(src) => {
                  setInitialShot(src)
                  if (!isReplacingScreenshot) {
                    setBankSelectDraft([])
                    setSavedSubmissions([])
                  }
                  setBankSelectSession((value) => value + 1)
                  setCurrentScreen("bank-select")
                }}
              />
            )}
            {currentScreen === "bank-select" && (
              <BankSelectScreen
                key={`bank-select-${bankSelectSession}`}
                kind={kind}
                initialShot={initialShot}
                initialRows={bankSelectInitialRows}
                lockedRowCount={isReplacingScreenshot ? savedSubmissions.length : 0}
                onBack={() => {
                  if (isReplacingScreenshot) {
                    setIsReplacingScreenshot(false)
                    setInitialShot("")
                    setCurrentScreen("processing")
                    return
                  }
                  setCurrentScreen("gallery")
                }}
                onNext={(nextSubmissions) => {
                  setProcessingError(null)
                  if (isReplacingScreenshot) {
                    const newSubmissions = nextSubmissions.slice(savedSubmissions.length)
                    setSubmissions((prev) => [...newSubmissions, ...prev])
                    setBankSelectDraft([...savedSubmissions, ...newSubmissions])
                    setIsReplacingScreenshot(false)
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
                  }))
                }}
                onReplaceScreenshot={() => {
                  setInitialShot("")
                  setProcessingError(null)
                  setIsReplacingScreenshot(true)
                  setCurrentScreen("gallery")
                }}
                onDone={(nextMatrix, summary) => {
                  setMatrix(nextMatrix)
                  setProcessingSummary((prev) => ({
                    skipped: summary.skipped,
                    lowConfidence: [...prev.lowConfidence, ...summary.lowConfidence],
                  }))
                  setProcessingError(null)
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
                processingSummary={processingSummary}
                onRestart={handleRestart}
                onUploadMore={() => setCurrentScreen("gallery")}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  )
}
