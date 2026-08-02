import postgres from "postgres";

import {
  parseDatabaseTarget,
  readDatabaseEnvironment,
  UnsafeDatabaseTargetError,
} from "../lib/db/target";
import { loadEnvironment } from "./environment";

// Reports what every configured variable actually resolves to, so pointing the
// wrong environment at production is visible before anything writes.
const VARIABLES = [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "DEV_DIRECT_DATABASE_URL",
  "TEST_DATABASE_URL",
  "PRODUCTION_DIRECT_DATABASE_URL",
] as const;

loadEnvironment();

const productionProjectRef = process.env.PRAXIS_PRODUCTION_PROJECT_REF?.trim();
let configured = 0;

for (const variable of VARIABLES) {
  const connectionString = process.env[variable]?.trim();

  if (!connectionString) {
    continue;
  }

  configured += 1;

  try {
    const target = parseDatabaseTarget(connectionString, variable);
    const sql = postgres(connectionString, { max: 1, prepare: false });

    try {
      const declared = await readDatabaseEnvironment(sql);
      const environment =
        declared ??
        (target.isLoopback ? "undeclared (loopback)" : "undeclared");
      const production = target.projectRef === productionProjectRef;

      console.log(
        `${variable}: ${target.description} — ${environment}${production ? " — PRODUCTION PROJECT" : ""}`,
      );
    } finally {
      await sql.end();
    }
  } catch (error) {
    const reason =
      error instanceof UnsafeDatabaseTargetError || error instanceof Error
        ? error.message
        : String(error);

    console.log(`${variable}: unreachable — ${reason}`);
    process.exitCode = 1;
  }
}

if (configured === 0) {
  console.error("No database connection variables are set.");
  process.exit(1);
}
