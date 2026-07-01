import { expect, type Page } from "@playwright/test"
import { uniqueTestEmail, TEST_PASSWORD } from "../../tests/integration/helpers/pocketbase-test-env"

export async function registerViaUi(page: Page): Promise<{ email: string; password: string }> {
  const email = uniqueTestEmail("e2e")
  const password = TEST_PASSWORD

  await page.getByRole("button", { name: "Регистрация" }).click()
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.locator('input[autocomplete="new-password"]').first().fill(password)
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(password)
  await page.getByRole("button", { name: "Создать аккаунт" }).click()

  await expect(page.getByRole("heading", { name: "CashbackBrain" })).not.toBeVisible({
    timeout: 15_000,
  })

  return { email, password }
}

export async function openAuthFromEmpty(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Войти, чтобы сохранить результат" }).click()
  await expect(page.getByRole("heading", { name: "CashbackBrain" })).toBeVisible()
}
