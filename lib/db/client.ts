import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

type DatabaseClient = {
  db: Database;
  sql: Sql;
};

declare global {
  var praxisDatabaseClient: DatabaseClient | undefined;
}

function createDatabaseClient(): DatabaseClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const sql = postgres(connectionString, {
    max: 10,
    prepare: false,
  });

  return {
    db: drizzle(sql, { schema }),
    sql,
  };
}

export function getDatabaseClient(): DatabaseClient {
  globalThis.praxisDatabaseClient ??= createDatabaseClient();
  return globalThis.praxisDatabaseClient;
}
