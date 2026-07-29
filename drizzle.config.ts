import "dotenv/config";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./supabase/migrations",
  dbCredentials: {
    url:
      process.env.DIRECT_DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
  migrations: {
    prefix: "supabase",
  },
  strict: true,
  verbose: true,
});
