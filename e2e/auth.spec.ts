import { test, expect } from "@playwright/test"
import { openAuthFromEmpty, registerViaUi } from "./fixtures/auth"

test.describe("guest-first auth", () => {
  test("shows empty screen without auth gate", async ({ page }) => {
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: "Собери кешбэки в одном месте" }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Войти", exact: true })).not.toBeVisible()
  })

  test("opens auth overlay from empty screen link", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await expect(page.getByRole("button", { name: "Вход" })).toBeVisible()
  })

  test("registers and closes overlay", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await registerViaUi(page)
    await expect(page.getByRole("button", { name: "Войти, чтобы сохранить результат" })).not.toBeVisible()
  })

  test("shows alert on wrong password", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await page.getByPlaceholder("you@example.com").fill("nobody@cashbackbrain.test")
    await page.locator('input[autocomplete="current-password"]').fill("WrongPass99!")
    await page.getByRole("button", { name: "Войти", exact: true }).click()
    await expect(page.locator("form [role='alert']")).toBeVisible()
  })

  test("logout returns to guest empty screen", async ({ page }) => {
    await page.goto("/")
    await openAuthFromEmpty(page)
    await registerViaUi(page)

    await page.getByRole("button", { name: "Открыть меню" }).click()
    await page.getByRole("button", { name: "Выйти" }).click()
    await page.getByRole("button", { name: "Выйти" }).click()

    await expect(
      page.getByRole("button", { name: "Войти, чтобы сохранить результат" }),
    ).toBeVisible()
  })
})
