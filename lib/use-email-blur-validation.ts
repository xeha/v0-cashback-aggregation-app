"use client"

import { useCallback, useState } from "react"
import { ApiError } from "@/lib/api"
import { validateEmailMx } from "@/lib/auth-api"
import { validateEmailFormat } from "@/lib/auth-validation"

type UseEmailBlurValidationOptions = {
  checkMx?: boolean
}

export function useEmailBlurValidation(options: UseEmailBlurValidationOptions = {}) {
  const checkMx = options.checkMx ?? true
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [fieldHint, setFieldHint] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const resetValidation = useCallback(() => {
    setFieldError(null)
    setFieldHint(null)
    setIsChecking(false)
  }, [])

  const validateOnBlur = useCallback(
    async (email: string) => {
      setFieldError(null)
      setFieldHint(null)

      const formatResult = validateEmailFormat(email)
      if (!formatResult.ok) {
        setFieldError(formatResult.message)
        return false
      }

      if (!checkMx) {
        return true
      }

      setIsChecking(true)
      try {
        await validateEmailMx(formatResult.email)
        setFieldHint("Домен принимает почту")
        return true
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : "Не удалось проверить email"
        setFieldError(message)
        return false
      } finally {
        setIsChecking(false)
      }
    },
    [checkMx],
  )

  return {
    fieldError,
    fieldHint,
    isChecking,
    validateOnBlur,
    resetValidation,
  }
}
