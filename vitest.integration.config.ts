import { defineConfig, mergeConfig } from "vitest/config"
import base from "./vitest.config"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/integration/**/*.test.ts"],
      testTimeout: 30_000,
      hookTimeout: 30_000,
      fileParallelism: false,
    },
  }),
)
