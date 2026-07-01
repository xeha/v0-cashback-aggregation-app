"use client"

import { useEffect } from "react"
import { registerServiceWorker } from "@/lib/register-service-worker"

export function PwaRegistrar() {
  useEffect(() => {
    void registerServiceWorker()
  }, [])

  return null
}
