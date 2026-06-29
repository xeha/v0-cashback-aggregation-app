/** Auth feature flags and URLs (PocketBase-backed). */

export const AUTH_REQUIRE_EMAIL_VERIFICATION =
  process.env.NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION !== "false"

export function getAppUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://cashbackbrain.ru"
}

export const VERIFY_EMAIL_PATH = "/verify-email"
export const RESET_PASSWORD_PATH = "/reset-password"
