import PocketBase from "pocketbase"

const configuredUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? ""

export function getPocketBaseUrl(): string {
  if (configuredUrl) {
    return configuredUrl
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:8090"
  }

  throw new Error("NEXT_PUBLIC_POCKETBASE_URL is not configured")
}

export function createPocketBase(): PocketBase {
  return new PocketBase(getPocketBaseUrl())
}
