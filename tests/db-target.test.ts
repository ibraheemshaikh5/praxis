import { describe, expect, it } from "vitest";

import {
  assertEnvironment,
  assertNonProductionTarget,
  parseDatabaseTarget,
  UnsafeDatabaseTargetError,
} from "@/lib/db/target";

const PRODUCTION_REF = "abcdefghijklmnopqrst";
const DEV_REF = "tsrqponmlkjihgfedcba";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const POOLED = `postgresql://postgres.${PRODUCTION_REF}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
const DIRECT = `postgresql://postgres:secret@db.${PRODUCTION_REF}.supabase.co:5432/postgres`;

describe("parseDatabaseTarget", () => {
  it("reads the project out of pooled and direct hosts alike", () => {
    expect(parseDatabaseTarget(POOLED, "URL").projectRef).toBe(PRODUCTION_REF);
    expect(parseDatabaseTarget(DIRECT, "URL").projectRef).toBe(PRODUCTION_REF);
    expect(parseDatabaseTarget(LOCAL, "URL").projectRef).toBeNull();
  });

  it("keeps credentials out of the description", () => {
    const target = parseDatabaseTarget(POOLED, "URL");

    expect(target.description).toBe(
      "aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(target.description).not.toContain("secret");
  });

  it("recognises the loopback stack", () => {
    expect(parseDatabaseTarget(LOCAL, "URL").isLoopback).toBe(true);
    expect(
      parseDatabaseTarget("postgresql://localhost:5432/praxis", "URL")
        .isLoopback,
    ).toBe(true);
    expect(parseDatabaseTarget(DIRECT, "URL").isLoopback).toBe(false);
  });

  it("rejects anything that is not a postgres connection string", () => {
    expect(() => parseDatabaseTarget("not a url", "URL")).toThrow(
      UnsafeDatabaseTargetError,
    );
    expect(() =>
      parseDatabaseTarget("https://db.example.com/postgres", "URL"),
    ).toThrow(UnsafeDatabaseTargetError);
  });
});

describe("assertNonProductionTarget", () => {
  const productionProjectRef = PRODUCTION_REF;

  it("refuses the production project by either host form", () => {
    for (const url of [POOLED, DIRECT]) {
      expect(() =>
        assertNonProductionTarget(url, { label: "URL", productionProjectRef }),
      ).toThrow(/production project/);
    }
  });

  it("allows the local stack and other projects", () => {
    const other = DIRECT.replace(PRODUCTION_REF, DEV_REF);

    expect(
      assertNonProductionTarget(LOCAL, { label: "URL", productionProjectRef })
        .isLoopback,
    ).toBe(true);
    expect(
      assertNonProductionTarget(other, { label: "URL", productionProjectRef })
        .projectRef,
    ).toBe(DEV_REF);
  });

  it("cannot recognise production when no project is configured", () => {
    expect(assertNonProductionTarget(POOLED, { label: "URL" }).projectRef).toBe(
      PRODUCTION_REF,
    );
  });
});

describe("assertEnvironment", () => {
  const local = parseDatabaseTarget(LOCAL, "URL");
  const remote = parseDatabaseTarget(
    DIRECT.replace(PRODUCTION_REF, DEV_REF),
    "URL",
  );
  const expected = ["development", "test"] as const;

  it("treats an undeclared loopback database as development", () => {
    expect(
      assertEnvironment(local, null, { expected, label: "TEST_DATABASE_URL" }),
    ).toBe("development");
  });

  it("refuses an undeclared remote database", () => {
    expect(() =>
      assertEnvironment(remote, null, { expected, label: "TEST_DATABASE_URL" }),
    ).toThrow(/no praxis\.environment declaration/);
  });

  it("refuses a production database even on loopback", () => {
    expect(() =>
      assertEnvironment(local, "production", {
        expected,
        label: "TEST_DATABASE_URL",
      }),
    ).toThrow(/is a production database/);
  });

  it("refuses a declaration it does not recognise", () => {
    expect(() =>
      assertEnvironment(remote, "staging", {
        expected,
        label: "TEST_DATABASE_URL",
      }),
    ).toThrow(/not one of development, test, production/);
  });

  it("accepts a declared non-production database", () => {
    expect(
      assertEnvironment(remote, " Development ", {
        expected,
        label: "TEST_DATABASE_URL",
      }),
    ).toBe("development");
    expect(
      assertEnvironment(remote, "test", {
        expected,
        label: "TEST_DATABASE_URL",
      }),
    ).toBe("test");
  });

  it("refuses a non-production database when production is required", () => {
    expect(() =>
      assertEnvironment(remote, "development", {
        expected: ["production"],
        label: "PRODUCTION_DIRECT_DATABASE_URL",
      }),
    ).toThrow(/requires production/);
  });
});
