import { existsSync } from "node:fs";

// Mirrors vitest.config.ts so scripts and tests see the same variables.
// Already-set variables win, so CI and deployment environments are unaffected.
export function loadEnvironment(): void {
  for (const file of [".env", ".env.local"]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function requireEnv(name: string, reason: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    fail(`${name} is not set. ${reason}`);
  }

  return value;
}
