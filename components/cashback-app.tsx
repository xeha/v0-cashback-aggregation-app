"use client"

import { AnimatePresence } from "framer-motion"
import { useState } from "react"
import { BankSelectScreen } from "@/components/screens/bank-select-screen"
import { EmptyScreen } from "@/components/screens/empty-screen"
import { GalleryScreen } from "@/components/screens/gallery-screen"
import { ProcessingScreen } from "@/components/screens/processing-screen"
import { ResultsScreen } from "@/components/screens/results-screen"

type Screen = "empty" | "gallery" | "bank-select" | "processing" | "results"

export function CashbackApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("empty")

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100 sm:py-8">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-[844px] sm:max-w-[400px] sm:rounded-[2.5rem] sm:shadow-2xl">
        <div className="relative flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {currentScreen === "empty" && (
              <EmptyScreen onUpload={() => setCurrentScreen("gallery")} />
            )}
            {currentScreen === "gallery" && (
              <GalleryScreen
                onCancel={() => setCurrentScreen("empty")}
                onAdd={() => setCurrentScreen("bank-select")}
              />
            )}
            {currentScreen === "bank-select" && (
              <BankSelectScreen
                onBack={() => setCurrentScreen("gallery")}
                onNext={() => setCurrentScreen("processing")}
              />
            )}
            {currentScreen === "processing" && (
              <ProcessingScreen onDone={() => setCurrentScreen("results")} />
            )}
            {currentScreen === "results" && (
              <ResultsScreen onRestart={() => setCurrentScreen("empty")} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  )
}
