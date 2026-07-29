import "dotenv/config";

import postgres from "postgres";

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Set DIRECT_DATABASE_URL or DATABASE_URL before running db:smoke",
  );
}

const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
});

try {
  const [result] = await sql<[{ database: string; serverVersion: string }]>`
    select
      current_database() as database,
      current_setting('server_version') as "serverVersion"
  `;

  console.log(
    `Database connection succeeded (${result.database}, PostgreSQL ${result.serverVersion}).`,
  );
} finally {
  await sql.end();
}
