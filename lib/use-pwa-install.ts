"use client"

import { useCallback, useEffect, useState } from "react"
import { isStandalonePwa } from "@/lib/pwa"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    setIsStandalone(isStandalonePwa())

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)

    if (outcome === "accepted") {
      setIsStandalone(true)
      return true
    }

    return false
  }, [deferredPrompt])

  return {
    isStandalone,
    canPromptInstall: deferredPrompt !== null,
    promptInstall,
  }
}
