"use client"

import { AnimatePresence } from "framer-motion"
import { useState } from "react"
import { BankSelectScreen } from "@/components/screens/bank-select-screen"
import { EmptyScreen } from "@/components/screens/empty-screen"
import { GalleryScreen } from "@/components/screens/gallery-screen"
import { ProcessingScreen } from "@/components/screens/processing-screen"
import { ResultsScreen } from "@/components/screens/results-screen"

type Screen = "empty" | "gallery" | "bank-select" | "processing" | "results"
type Kind = "bank" | "market"

export function CashbackApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("empty")
  const [kind, setKind] = useState<Kind>("bank")
  const [initialShot, setInitialShot] = useState<string>("")

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
                onLogout={() => {
                  setInitialShot("")
                  setKind("bank")
                  setCurrentScreen("empty")
                }}
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
                onNext={() => setCurrentScreen("processing")}
              />
            )}
            {currentScreen === "processing" && (
              <ProcessingScreen onDone={() => setCurrentScreen("results")} />
            )}
            {currentScreen === "results" && (
              <ResultsScreen
                kind={kind}
                onRestart={() => setCurrentScreen("empty")}
                onUploadMore={() => setCurrentScreen("gallery")}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  )
}
