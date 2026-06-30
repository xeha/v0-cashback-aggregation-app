"use client"

import { AuthProvider } from "@/lib/auth-context"
import { PwaRegistrar } from "@/components/pwa-registrar"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PwaRegistrar />
      {children}
    </AuthProvider>
  )
}
