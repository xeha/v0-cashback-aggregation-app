"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type PocketBase from "pocketbase"
import type { RecordModel } from "pocketbase"
import { formatAuthError } from "@/lib/auth-errors"
import { validateRegisterInput } from "@/lib/auth-validation"
import { createPocketBase } from "@/lib/pocketbase"

type AuthContextValue = {
  pb: PocketBase
  user: RecordModel | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, passwordConfirm: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

let clientPb: PocketBase | null = null

function getClientPocketBase(): PocketBase {
  if (!clientPb) {
    clientPb = createPocketBase()
  }
  return clientPb
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pb = useMemo(() => getClientPocketBase(), [])
  const [user, setUser] = useState<RecordModel | null>(pb.authStore.record)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record)
    }, true)

    async function initAuth() {
      if (!pb.authStore.isValid) {
        setIsLoading(false)
        return
      }

      try {
        await pb.collection("users").authRefresh()
      } catch {
        pb.authStore.clear()
      } finally {
        setIsLoading(false)
      }
    }

    void initAuth()

    return unsubscribe
  }, [pb])

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        await pb.collection("users").authWithPassword(email.trim(), password)
      } catch (error) {
        throw new Error(formatAuthError(error))
      }
    },
    [pb],
  )

  const register = useCallback(
    async (email: string, password: string, passwordConfirm: string) => {
      const validation = validateRegisterInput(email, password, passwordConfirm)
      if (!validation.ok) {
        throw new Error(validation.message)
      }
      const trimmedEmail = validation.email

      try {
        await pb.collection("users").create({
          email: trimmedEmail,
          password,
          passwordConfirm,
        })
        await pb.collection("users").authWithPassword(trimmedEmail, password)
      } catch (error) {
        throw new Error(formatAuthError(error))
      }
    },
    [pb],
  )

  const logout = useCallback(() => {
    pb.authStore.clear()
  }, [pb])

  const value = useMemo(
    () => ({
      pb,
      user,
      isLoading,
      login,
      register,
      logout,
    }),
    [pb, user, isLoading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
