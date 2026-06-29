import PocketBase from "pocketbase"

const url = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? ""

export function getPocketBaseUrl(): string {
  if (!url) {
    throw new Error("NEXT_PUBLIC_POCKETBASE_URL is not configured")
  }
  return url
}

export function createPocketBase(): PocketBase {
  const pb = new PocketBase(getPocketBaseUrl())
  pb.autoCancellation(false)
  return pb
}
