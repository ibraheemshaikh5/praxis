import postgres from "postgres";

import {
  assertDatabaseEnvironment,
  assertNonProductionTarget,
  UnsafeDatabaseTargetError,
} from "../lib/db/target";
import { fail, loadEnvironment, requireEnv } from "./environment";

// Fails the run before vitest starts, so a misconfigured target reports one
// clear error instead of an identical failure inside every suite.
loadEnvironment();

try {
  const databaseUrl = requireEnv(
    "TEST_DATABASE_URL",
    "Point it at the local Supabase stack or the dev project.",
  );

  if (databaseUrl === process.env.DATABASE_URL?.trim()) {
    fail(
      "TEST_DATABASE_URL matches DATABASE_URL. Integration tests delete rows, so they need their own database.",
    );
  }

  const target = assertNonProductionTarget(databaseUrl, {
    label: "TEST_DATABASE_URL",
    productionProjectRef: process.env.PRAXIS_PRODUCTION_PROJECT_REF,
  });

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const environment = await assertDatabaseEnvironment(sql, target, {
      expected: ["development", "test"],
      label: "TEST_DATABASE_URL",
    });

    console.log(
      `Integration tests will run against ${target.description} (${environment}).`,
    );
  } finally {
    await sql.end();
  }
} catch (error) {
  if (error instanceof UnsafeDatabaseTargetError) {
    fail(error.message);
  }

  throw error;
}
