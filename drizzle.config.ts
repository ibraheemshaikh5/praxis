import { defineConfig } from "drizzle-kit";

import { assertNonProductionTarget } from "./lib/db/target";
import { loadEnvironment } from "./scripts/environment";

loadEnvironment();

// Schema tooling never targets production. It reads the dev project, or the
// local stack when that is not configured.
const url =
  process.env.DEV_DIRECT_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

assertNonProductionTarget(url, {
  label: "DEV_DIRECT_DATABASE_URL",
  productionProjectRef: process.env.PRAXIS_PRODUCTION_PROJECT_REF,
});

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./supabase/migrations",
  dbCredentials: { url },
  migrations: {
    prefix: "supabase",
  },
  strict: true,
  verbose: true,
});
