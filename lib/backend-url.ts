/** FastAPI base URL — empty string in dev uses Next.js rewrite proxy (same origin). */
export function getBackendUrl(): string {
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()
    if (configured) return configured
    return ""
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"
}
