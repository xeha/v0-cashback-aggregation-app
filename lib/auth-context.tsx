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
import { AUTH_REQUIRE_EMAIL_VERIFICATION } from "@/lib/auth-config"
import {
  formatAuthError,
  GENERIC_PASSWORD_RESET_MESSAGE,
  GENERIC_VERIFICATION_RESENT_MESSAGE,
} from "@/lib/auth-errors"
import { validateEmailMx } from "@/lib/auth-api"
import { ApiError } from "@/lib/api"
import {
  validateForgotPasswordInput,
  validateLoginInput,
  validateRegisterInput,
  validateResetPasswordInput,
} from "@/lib/auth-validation"
import { createPocketBase } from "@/lib/pocketbase"

export type RegisterResult =
  | { status: "logged-in" }
  | { status: "verification-sent"; email: string }

type AuthContextValue = {
  pb: PocketBase
  user: RecordModel | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    passwordConfirm: string,
  ) => Promise<RegisterResult>
  logout: () => void
  requestPasswordReset: (email: string) => Promise<string>
  resetPassword: (token: string, password: string, passwordConfirm: string) => Promise<void>
  confirmEmailVerification: (token: string) => Promise<void>
  resendVerification: (email: string) => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

let clientPb: PocketBase | null = null

function getClientPocketBase(): PocketBase {
  if (typeof window === "undefined") {
    return createPocketBase()
  }

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
      const validation = validateLoginInput(email, password)
      if (!validation.ok) {
        throw new Error(validation.message)
      }

      try {
        await pb.collection("users").authWithPassword(validation.email, password)
      } catch (error) {
        throw new Error(formatAuthError(error))
      }
    },
    [pb],
  )

  const register = useCallback(
    async (
      email: string,
      password: string,
      passwordConfirm: string,
    ): Promise<RegisterResult> => {
      const validation = validateRegisterInput(email, password, passwordConfirm)
      if (!validation.ok) {
        throw new Error(validation.message)
      }

      try {
        await validateEmailMx(validation.email)

        await pb.collection("users").create({
          email: validation.email,
          password,
          passwordConfirm,
        })

        if (AUTH_REQUIRE_EMAIL_VERIFICATION) {
          await pb.collection("users").requestVerification(validation.email)
          return { status: "verification-sent", email: validation.email }
        }

        await pb.collection("users").authWithPassword(validation.email, password)
        return { status: "logged-in" }
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new Error(formatAuthError(error))
      }
    },
    [pb],
  )

  const requestPasswordReset = useCallback(
    async (email: string): Promise<string> => {
      const validation = validateForgotPasswordInput(email)
      if (!validation.ok) {
        throw new Error(validation.message)
      }

      try {
        await validateEmailMx(validation.email)
        await pb.collection("users").requestPasswordReset(validation.email)
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        const message = formatAuthError(error)
        if (message.includes("429") || message.includes("Слишком много")) {
          throw new Error(message)
        }
      }

      return GENERIC_PASSWORD_RESET_MESSAGE
    },
    [pb],
  )

  const resetPassword = useCallback(
    async (token: string, password: string, passwordConfirm: string) => {
      const validation = validateResetPasswordInput(password, passwordConfirm)
      if (!validation.ok) {
        throw new Error(validation.message)
      }

      if (!token.trim()) {
        throw new Error("Ссылка недействительна или устарела")
      }

      try {
        await pb.collection("users").confirmPasswordReset(token, password, passwordConfirm)
        pb.authStore.clear()
      } catch (error) {
        throw new Error(formatAuthError(error))
      }
    },
    [pb],
  )

  const confirmEmailVerification = useCallback(
    async (token: string) => {
      if (!token.trim()) {
        throw new Error("Ссылка недействительна или устарела")
      }

      try {
        await pb.collection("users").confirmVerification(token)
      } catch (error) {
        throw new Error(formatAuthError(error))
      }
    },
    [pb],
  )

  const resendVerification = useCallback(
    async (email: string): Promise<string> => {
      const validation = validateForgotPasswordInput(email)
      if (!validation.ok) {
        throw new Error(validation.message)
      }

      try {
        await validateEmailMx(validation.email)
        await pb.collection("users").requestVerification(validation.email)
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        const message = formatAuthError(error)
        if (message.includes("429") || message.includes("Слишком много")) {
          throw new Error(message)
        }
      }

      return GENERIC_VERIFICATION_RESENT_MESSAGE
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
      requestPasswordReset,
      resetPassword,
      confirmEmailVerification,
      resendVerification,
    }),
    [
      pb,
      user,
      isLoading,
      login,
      register,
      logout,
      requestPasswordReset,
      resetPassword,
      confirmEmailVerification,
      resendVerification,
    ],
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
