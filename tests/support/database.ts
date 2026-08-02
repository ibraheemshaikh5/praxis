import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  assertDatabaseEnvironment,
  assertNonProductionTarget,
} from "@/lib/db/target";

const databaseUrl = process.env.TEST_DATABASE_URL;

export const describeDatabase = databaseUrl ? describe : describe.skip;

// `describe.skip` still evaluates the suite body, so a skipped run still builds
// a client. It is never connected, because no hook or test runs.
const UNUSED_URL = "postgresql://praxis@127.0.0.1:1/unused";

type TestDatabase = {
  client: Sql;
  db: PostgresJsDatabase<typeof schema>;
};

/**
 * The only way an integration suite reaches a database. Opening a connection
 * anywhere else skips the guard, so suites do not.
 *
 * Each suite owns a distinct set of user IDs; fixtures are created and removed
 * around every test so parallel files cannot delete each other's rows.
 */
export function useTestDatabase(users: readonly string[]): TestDatabase {
  const client = postgres(databaseUrl ?? UNUSED_URL, {
    max: 1,
    prepare: false,
  });
  const db = drizzle(client, { schema });

  const removeUsers = () => client`
    delete from auth.users where id = any(${users as string[]}::uuid[])
  `;

  beforeAll(async () => {
    const target = assertNonProductionTarget(databaseUrl!, {
      label: "TEST_DATABASE_URL",
      productionProjectRef: process.env.PRAXIS_PRODUCTION_PROJECT_REF,
    });

    await assertDatabaseEnvironment(client, target, {
      expected: ["development", "test"],
      label: "TEST_DATABASE_URL",
    });
  });

  beforeEach(async () => {
    await removeUsers();
    await client`
      insert into auth.users (id)
      select id from unnest(${users as string[]}::uuid[]) as fixture(id)
    `;
  });

  afterAll(async () => {
    await removeUsers();
    await client.end();
  });

  return { client, db };
}
