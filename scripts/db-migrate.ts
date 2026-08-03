import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

import postgres, { type Sql } from "postgres";

import {
  assertDatabaseEnvironment,
  assertNonProductionTarget,
  parseDatabaseTarget,
  type DatabaseTarget,
  UnsafeDatabaseTargetError,
} from "../lib/db/target";
import { fail, loadEnvironment, requireEnv } from "./environment";

const MIGRATIONS_DIRECTORY = "supabase/migrations";
const CONFIRMATION_VARIABLE = "PRAXIS_CONFIRM_PRODUCTION";

const [environmentArgument, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");

if (environmentArgument !== "dev" && environmentArgument !== "production") {
  fail("Usage: tsx scripts/db-migrate.ts <dev|production> [--dry-run]");
}

loadEnvironment();

function localMigrationVersions(): string[] {
  return readdirSync(MIGRATIONS_DIRECTORY)
    .filter((entry) => entry.endsWith(".sql"))
    .map((entry) => entry.split("_", 1)[0])
    .sort();
}

async function appliedVersions(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ version: string }[]>`
    select version from supabase_migrations.schema_migrations
  `.catch(() => []);

  return new Set(rows.map((row) => row.version));
}

async function connect<T>(
  connectionString: string,
  run: (sql: Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(connectionString, { max: 1, prepare: false });

  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Production only receives migrations that the dev project already carries. A
 * migration that has never been applied to a hosted database is not ready for
 * the one holding real data.
 */
async function assertRehearsedOnDev(pending: string[]): Promise<void> {
  const devUrl = requireEnv(
    "DEV_DIRECT_DATABASE_URL",
    "Production migrations are rehearsed on the dev project first.",
  );

  const devTarget = assertNonProductionTarget(devUrl, {
    label: "DEV_DIRECT_DATABASE_URL",
    productionProjectRef: process.env.PRAXIS_PRODUCTION_PROJECT_REF,
  });

  const applied = await connect(devUrl, async (sql) => {
    await assertDatabaseEnvironment(sql, devTarget, {
      expected: ["development", "test"],
      label: "DEV_DIRECT_DATABASE_URL",
    });

    return appliedVersions(sql);
  });

  const unrehearsed = pending.filter((version) => !applied.has(version));

  if (unrehearsed.length > 0) {
    fail(
      `These migrations have not been applied to the dev project (${devTarget.description}):\n` +
        unrehearsed.map((version) => `  ${version}`).join("\n") +
        "\nRun pnpm db:migrate:dev first.",
    );
  }
}

function requireConfirmation(target: DatabaseTarget): void {
  const expected = target.projectRef ?? target.description;
  const given = process.env[CONFIRMATION_VARIABLE]?.trim();

  if (given !== expected) {
    fail(
      `Refusing to migrate production (${target.description}).\n` +
        `Re-run with ${CONFIRMATION_VARIABLE}=${expected} once the change has been reviewed.`,
    );
  }
}

async function resolveTarget(): Promise<{
  connectionString: string;
  target: DatabaseTarget;
}> {
  if (environmentArgument === "dev") {
    const connectionString = requireEnv(
      "DEV_DIRECT_DATABASE_URL",
      "It is the direct connection for the dev Supabase project.",
    );

    const target = assertNonProductionTarget(connectionString, {
      label: "DEV_DIRECT_DATABASE_URL",
      productionProjectRef: process.env.PRAXIS_PRODUCTION_PROJECT_REF,
    });

    await connect(connectionString, (sql) =>
      assertDatabaseEnvironment(sql, target, {
        expected: ["development", "test"],
        label: "DEV_DIRECT_DATABASE_URL",
      }),
    );

    return { connectionString, target };
  }

  const connectionString = requireEnv(
    "PRODUCTION_DIRECT_DATABASE_URL",
    "It is the direct connection for the production Supabase project.",
  );

  const target = parseDatabaseTarget(
    connectionString,
    "PRODUCTION_DIRECT_DATABASE_URL",
  );

  const productionProjectRef =
    process.env.PRAXIS_PRODUCTION_PROJECT_REF?.trim();

  // The denylist runs in reverse here: a URL labelled production that resolves
  // somewhere else is just as wrong as the other way around.
  if (productionProjectRef && target.projectRef !== productionProjectRef) {
    fail(
      `PRODUCTION_DIRECT_DATABASE_URL (${target.description}) is not the production project ${productionProjectRef}.`,
    );
  }

  const pending = await connect(connectionString, async (sql) => {
    await assertDatabaseEnvironment(sql, target, {
      expected: ["production"],
      label: "PRODUCTION_DIRECT_DATABASE_URL",
    });

    const applied = await appliedVersions(sql);
    return localMigrationVersions().filter((version) => !applied.has(version));
  });

  if (pending.length === 0) {
    console.log(`${target.description} is already up to date.`);
    process.exit(0);
  }

  await assertRehearsedOnDev(pending);

  if (!dryRun) {
    requireConfirmation(target);
  }

  return { connectionString, target };
}

try {
  const { connectionString, target } = await resolveTarget();

  console.log(
    `${dryRun ? "Planning" : "Applying"} migrations against ${target.description}.`,
  );

  const push = spawnSync(
    "supabase",
    [
      "db",
      "push",
      "--db-url",
      connectionString,
      ...(dryRun ? ["--dry-run"] : []),
    ],
    { stdio: "inherit" },
  );

  process.exit(push.status ?? 1);
} catch (error) {
  if (error instanceof UnsafeDatabaseTargetError) {
    fail(error.message);
  }

  throw error;
}
