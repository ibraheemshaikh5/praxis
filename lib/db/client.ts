import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

type DatabaseClient = {
  db: PostgresJsDatabase;
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
    db: drizzle(sql),
    sql,
  };
}

export function getDatabaseClient(): DatabaseClient {
  if (process.env.NODE_ENV === "production") {
    return createDatabaseClient();
  }

  globalThis.praxisDatabaseClient ??= createDatabaseClient();
  return globalThis.praxisDatabaseClient;
}
