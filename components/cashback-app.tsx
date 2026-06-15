"use client"

import { AnimatePresence } from "framer-motion"
import { useState } from "react"
import { BankSelectScreen } from "@/components/screens/bank-select-screen"
import { EmptyScreen } from "@/components/screens/empty-screen"
import { GalleryScreen } from "@/components/screens/gallery-screen"
import { ProcessingScreen } from "@/components/screens/processing-screen"
import { ResultsScreen } from "@/components/screens/results-screen"
import type { Kind, MatrixState, SourceSubmission } from "@/lib/types"

type Screen = "empty" | "gallery" | "bank-select" | "processing" | "results"

function resetState() {
  return {
    currentScreen: "empty" as Screen,
    kind: "bank" as Kind,
    initialShot: "",
    submissions: [] as SourceSubmission[],
    matrix: { bank: null, market: null } as MatrixState,
    processingError: null as string | null,
  }
}

export function CashbackApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("empty")
  const [kind, setKind] = useState<Kind>("bank")
  const [initialShot, setInitialShot] = useState("")
  const [submissions, setSubmissions] = useState<SourceSubmission[]>([])
  const [matrix, setMatrix] = useState<MatrixState>({ bank: null, market: null })
  const [processingError, setProcessingError] = useState<string | null>(null)

  function handleRestart() {
    const next = resetState()
    setCurrentScreen(next.currentScreen)
    setKind(next.kind)
    setInitialShot(next.initialShot)
    setSubmissions(next.submissions)
    setMatrix(next.matrix)
    setProcessingError(next.processingError)
  }

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
                onCancel={() => setCurrentScreen("empty")}
                onAdd={(src) => {
                  setInitialShot(src)
                  setCurrentScreen("bank-select")
                }}
              />
            )}
            {currentScreen === "bank-select" && (
              <BankSelectScreen
                kind={kind}
                initialShot={initialShot}
                onBack={() => setCurrentScreen("gallery")}
                onNext={(nextSubmissions) => {
                  setSubmissions(nextSubmissions)
                  setProcessingError(null)
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
                onDone={(nextMatrix) => {
                  setMatrix(nextMatrix)
                  setProcessingError(null)
                  setCurrentScreen("results")
                }}
                onError={(message) => setProcessingError(message)}
              />
            )}
            {currentScreen === "results" && (
              <ResultsScreen
                kind={kind}
                matrix={matrix}
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
