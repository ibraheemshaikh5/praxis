import type { Sql } from "postgres";

// Every Praxis database declares what it is, and guards read that back before
// writing. A stale or mistyped connection string then fails closed instead of
// landing on production.
//
// The declaration is a table rather than a database-level setting because
// Supabase's `postgres` role is not a superuser and cannot set custom
// parameters. It is created by `pnpm db:declare`, never by a migration, so a
// database cannot inherit a declaration it did not ask for.
export const ENVIRONMENT_TABLE = "praxis.environment";

export const ENVIRONMENTS = ["development", "test", "production"] as const;

export type DatabaseEnvironment = (typeof ENVIRONMENTS)[number];

export type DatabaseTarget = {
  readonly database: string;
  /** Host, port, and database with credentials stripped. Safe to print. */
  readonly description: string;
  readonly isLoopback: boolean;
  /** Supabase project the URL resolves to, when the host names one. */
  readonly projectRef: string | null;
};

export class UnsafeDatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDatabaseTargetError";
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isEnvironment(value: string): value is DatabaseEnvironment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

function readProjectRef(url: URL): string | null {
  const host = url.hostname.toLowerCase();

  // Pooled connections share a host per region and carry the project in the
  // username instead.
  if (host.endsWith(".pooler.supabase.com")) {
    const username = decodeURIComponent(url.username);
    const separator = username.indexOf(".");
    return separator === -1 ? null : username.slice(separator + 1) || null;
  }

  return /^db\.([a-z0-9]+)\.supabase\.(?:co|com|net)$/.exec(host)?.[1] ?? null;
}

export function parseDatabaseTarget(
  connectionString: string,
  label: string,
): DatabaseTarget {
  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new UnsafeDatabaseTargetError(
      `${label} is not a valid connection string.`,
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new UnsafeDatabaseTargetError(
      `${label} must be a postgresql:// connection string.`,
    );
  }

  const host = url.hostname.toLowerCase();
  const port = url.port || "5432";
  const database =
    decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";

  return {
    database,
    description: `${host}:${port}/${database}`,
    isLoopback: LOOPBACK_HOSTS.has(host) || host.startsWith("127."),
    projectRef: readProjectRef(url),
  };
}

/**
 * Rejects a connection string that names the production project. This is the
 * cheap layer: it produces a precise error, but it only recognises production
 * when the project is known, so it never clears a target on its own.
 */
export function assertNonProductionTarget(
  connectionString: string,
  options: { label: string; productionProjectRef?: string | null },
): DatabaseTarget {
  const target = parseDatabaseTarget(connectionString, options.label);
  const productionProjectRef = options.productionProjectRef?.trim();

  if (productionProjectRef && target.projectRef === productionProjectRef) {
    throw new UnsafeDatabaseTargetError(
      `${options.label} points at the production project ${productionProjectRef} (${target.description}).`,
    );
  }

  return target;
}

/**
 * Rejects a database whose own declaration does not match what the command
 * needs. This is the layer that decides: an undeclared remote database is
 * refused, so an unrecognised production URL cannot pass by being unknown.
 */
export function assertEnvironment(
  target: DatabaseTarget,
  declaration: string | null,
  options: { expected: readonly DatabaseEnvironment[]; label: string },
): DatabaseEnvironment {
  const declared = declaration?.trim().toLowerCase() ?? "";

  // The local stack is rebuilt from migrations on every reset, so it is allowed
  // to stay undeclared. Anything reachable over the network is not.
  const environment =
    declared === "" && target.isLoopback ? "development" : declared;

  if (environment === "") {
    throw new UnsafeDatabaseTargetError(
      `${options.label} (${target.description}) has no ${ENVIRONMENT_TABLE} declaration. ` +
        `Run: pnpm db:declare ${options.label} development`,
    );
  }

  if (!isEnvironment(environment)) {
    throw new UnsafeDatabaseTargetError(
      `${options.label} (${target.description}) declares '${environment}', which is not one of ${ENVIRONMENTS.join(", ")}.`,
    );
  }

  if (!options.expected.includes(environment)) {
    throw new UnsafeDatabaseTargetError(
      `${options.label} (${target.description}) is a ${environment} database; this command requires ${options.expected.join(" or ")}.`,
    );
  }

  return environment;
}

// A database that has never been declared has no praxis schema at all.
const MISSING_RELATION_CODES = new Set(["3F000", "42P01"]);

function isMissingDeclaration(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    MISSING_RELATION_CODES.has(error.code)
  );
}

export async function readDatabaseEnvironment(
  sql: Sql,
): Promise<string | null> {
  try {
    const [row] = await sql<{ name: string }[]>`
      select name from praxis.environment
    `;

    return row?.name ?? null;
  } catch (error) {
    if (isMissingDeclaration(error)) {
      return null;
    }

    throw error;
  }
}

export async function assertDatabaseEnvironment(
  sql: Sql,
  target: DatabaseTarget,
  options: { expected: readonly DatabaseEnvironment[]; label: string },
): Promise<DatabaseEnvironment> {
  return assertEnvironment(target, await readDatabaseEnvironment(sql), options);
}
