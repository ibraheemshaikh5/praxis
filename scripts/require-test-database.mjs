import { existsSync } from "node:fs";

// Mirrors vitest.config.ts so the guard sees the same variables the tests do.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is required for integration tests.");
  process.exit(1);
}
