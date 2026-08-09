import { existsSync } from "node:fs";

import { defineConfig } from "vitest/config";

// Integration tests skip themselves without TEST_DATABASE_URL. Load it from
// .env.local so local runs cover them; already-set variables win, so CI is
// unaffected.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
      "server-only": new URL("tests/support/server-only.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    coverage: {
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    env: {
      PRAXIS_PRODUCTION_PROJECT_REF:
        process.env.PRAXIS_PRODUCTION_PROJECT_REF ?? "",
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    },
    environment: "node",
  },
});
