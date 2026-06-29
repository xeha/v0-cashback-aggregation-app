import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        env: {
          NEXT_PUBLIC_POCKETBASE_URL:
            process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "http://127.0.0.1:8090",
          NEXT_PUBLIC_BACKEND_URL:
            process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000",
        },
      },
})
