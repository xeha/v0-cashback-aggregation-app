import { describe, it, expect, beforeAll } from "vitest"
import { ClientResponseError } from "pocketbase"
import { formatAuthError } from "@/lib/auth-errors"
import { validateRegisterInput } from "@/lib/auth-validation"
import {
  createTestPocketBase,
  isPocketBaseReady,
  uniqueTestEmail,
  TEST_PASSWORD,
  POCKETBASE_TEST_URL,
} from "./helpers/pocketbase-test-env"

const pbReady = await isPocketBaseReady()

describe.skipIf(!pbReady)("PocketBase auth integration", () => {
  beforeAll(() => {
    if (!pbReady) {
      console.warn(`PocketBase not reachable at ${POCKETBASE_TEST_URL} — skipping integration tests`)
    }
  })

  it("registers, logs in, refreshes, logs out", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail()

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    const login = await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    expect(login.token).toBeTruthy()
    expect(pb.authStore.isValid).toBe(true)

    const refreshed = await pb.collection("users").authRefresh()
    expect(refreshed.token).toBeTruthy()

    pb.authStore.clear()
    expect(pb.authStore.isValid).toBe(false)
  })

  it("rejects duplicate email", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail()

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    await expect(
      pb.collection("users").create({
        email,
        password: TEST_PASSWORD,
        passwordConfirm: TEST_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(ClientResponseError)
  })

  it("returns same error for wrong password and unknown email", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail()

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })
    pb.authStore.clear()

    let wrongPasswordMessage = ""
    let unknownEmailMessage = ""

    try {
      await pb.collection("users").authWithPassword(email, "WrongPass99!")
    } catch (error) {
      wrongPasswordMessage = formatAuthError(error)
    }

    try {
      await pb.collection("users").authWithPassword("missing@cashbackbrain.test", TEST_PASSWORD)
    } catch (error) {
      unknownEmailMessage = formatAuthError(error)
    }

    expect(wrongPasswordMessage).toBeTruthy()
    expect(wrongPasswordMessage).toBe(unknownEmailMessage)
  })

  it("rejects SQL injection payloads with 400", async () => {
    const pb = createTestPocketBase()

    await expect(
      pb.collection("users").authWithPassword("' OR 1=1--", TEST_PASSWORD),
    ).rejects.toMatchObject({ status: 400 })
  })

  it("accepts email with plus addressing", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail("plus").replace("@", "+tag@")

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    const login = await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    expect(login.record?.email).toBe(email)
  })

  it("re-login after logout restores valid session", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail("relogin")

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    pb.authStore.clear()
    expect(pb.authStore.isValid).toBe(false)

    const second = await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    expect(second.token).toBeTruthy()
    expect(pb.authStore.isValid).toBe(true)
  })

  it("authRefresh keeps session valid", async () => {
    const pb = createTestPocketBase()
    const email = uniqueTestEmail("refresh")

    await pb.collection("users").create({
      email,
      password: TEST_PASSWORD,
      passwordConfirm: TEST_PASSWORD,
    })

    await pb.collection("users").authWithPassword(email, TEST_PASSWORD)
    const refreshed = await pb.collection("users").authRefresh()

    expect(refreshed.token).toBeTruthy()
    expect(pb.authStore.isValid).toBe(true)
  })

  it("requestPasswordReset returns without error for unknown email", async () => {
    const pb = createTestPocketBase()
    await expect(
      pb.collection("users").requestPasswordReset("missing@cashbackbrain.test"),
    ).resolves.toBeTruthy()
  })

  it("requestVerification returns without error for unknown email", async () => {
    const pb = createTestPocketBase()
    await expect(
      pb.collection("users").requestVerification("missing@cashbackbrain.test"),
    ).resolves.toBeTruthy()
  })
})

describe("client validation aligned with PB", () => {
  it("rejects weak passwords before API call", () => {
    const result = validateRegisterInput("user@example.com", "weak", "weak")
    expect(result.ok).toBe(false)
  })
})
