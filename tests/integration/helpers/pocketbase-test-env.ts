import PocketBase from "pocketbase"

export const POCKETBASE_TEST_URL =
  process.env.POCKETBASE_TEST_URL ?? "http://127.0.0.1:8090"

export async function isPocketBaseReady(): Promise<boolean> {
  try {
    const response = await fetch(`${POCKETBASE_TEST_URL}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

export function createTestPocketBase(): PocketBase {
  return new PocketBase(POCKETBASE_TEST_URL)
}

export function uniqueTestEmail(prefix = "auth-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cashbackbrain.test`
}

export const TEST_PASSWORD = "TestPass123!"
