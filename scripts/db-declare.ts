import postgres from "postgres";

import {
  ENVIRONMENTS,
  parseDatabaseTarget,
  readDatabaseEnvironment,
  type DatabaseEnvironment,
  UnsafeDatabaseTargetError,
} from "../lib/db/target";
import { fail, loadEnvironment, requireEnv } from "./environment";

const CONFIRMATION_VARIABLE = "PRAXIS_CONFIRM_PRODUCTION";

const [variable, environment] = process.argv.slice(2);

if (!variable || !ENVIRONMENTS.includes(environment as DatabaseEnvironment)) {
  fail(
    `Usage: tsx scripts/db-declare.ts <CONNECTION_VARIABLE> <${ENVIRONMENTS.join("|")}>`,
  );
}

loadEnvironment();

try {
  const connectionString = requireEnv(
    variable,
    "It names the database to declare.",
  );

  const target = parseDatabaseTarget(connectionString, variable);
  const productionProjectRef =
    process.env.PRAXIS_PRODUCTION_PROJECT_REF?.trim();
  const isProductionProject =
    productionProjectRef !== undefined &&
    productionProjectRef !== "" &&
    target.projectRef === productionProjectRef;

  if (environment === "production") {
    const expected = target.projectRef ?? target.description;

    if (process.env[CONFIRMATION_VARIABLE]?.trim() !== expected) {
      fail(
        `Declaring ${target.description} as production is deliberate.\n` +
          `Re-run with ${CONFIRMATION_VARIABLE}=${expected}.`,
      );
    }
  } else if (isProductionProject) {
    fail(
      `${variable} (${target.description}) is the production project ${productionProjectRef}; it cannot be declared ${environment}.`,
    );
  }

  const sql = postgres(connectionString, { max: 1, prepare: false });

  try {
    const declared = await readDatabaseEnvironment(sql);

    if (declared === environment) {
      console.log(`${target.description} already declares ${environment}.`);
      process.exit(0);
    }

    // Changing a declaration silently would defeat it. Removing the row by hand
    // is the deliberate act that allows a new one.
    if (declared !== null) {
      fail(
        `${target.description} already declares ${declared}. ` +
          `Run "delete from praxis.environment;" against it first if that is wrong.`,
      );
    }

    await sql.unsafe(`
      create schema if not exists praxis;

      create table if not exists praxis.environment (
        singleton boolean primary key default true check (singleton),
        name text not null check (name in ('development', 'test', 'production')),
        declared_at timestamptz not null default now()
      );

      revoke all on schema praxis from anon, authenticated;
      revoke all on praxis.environment from anon, authenticated;
    `);

    await sql`
      insert into praxis.environment (name) values (${environment})
    `;

    console.log(`${target.description} now declares ${environment}.`);
  } finally {
    await sql.end();
  }
} catch (error) {
  if (error instanceof UnsafeDatabaseTargetError) {
    fail(error.message);
  }

  throw error;
}
