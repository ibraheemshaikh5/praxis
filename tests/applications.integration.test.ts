import { beforeAll, expect, it } from "vitest";

import { ApplicationsService } from "@/lib/applications/service";
import { ConflictError, NotFoundError } from "@/lib/daily-planner/errors";
import { describeDatabase, useTestDatabase } from "./support/database";

// Distinct from the planner and metrics suites so parallel test files cannot
// delete each other's fixtures.
const USER_ONE = "00000000-0000-4000-8000-000000000021";
const USER_TWO = "00000000-0000-4000-8000-000000000022";
const CYCLE = "S27";
const APPLIED_ON = "2026-08-02";

describeDatabase("internship applications database integration", () => {
  const { client, db } = useTestDatabase([USER_ONE, USER_TWO]);
  const service = new ApplicationsService(db);

  beforeAll(async () => {
    const [result] = await client<[{ rlsTables: number; grants: number }]>`
      select
        (
          select count(*)::integer
          from pg_class
          where relname in ('applications', 'google_connections')
          and relrowsecurity
        ) as "rlsTables",
        (
          select count(*)::integer
          from information_schema.role_table_grants
          where table_name = 'google_connections'
          and grantee in ('anon', 'authenticated')
        ) as grants
    `;
    // The refresh token must be unreachable from a browser session.
    expect(result).toEqual({ rlsTables: 2, grants: 0 });
  });

  function log(userId: string, company: string, cycle = CYCLE) {
    return service.createApplication(userId, {
      cycle,
      company,
      title: "Software Engineer Intern",
      appliedOn: APPLIED_ON,
    });
  }

  it("numbers applications per user and per cycle", async () => {
    const first = await log(USER_ONE, "Ramp");
    const second = await log(USER_ONE, "Figma");
    const otherCycle = await log(USER_ONE, "Stripe", "F26");
    const otherUser = await log(USER_TWO, "Vercel");

    expect(first.applicationNumber).toBe(1);
    expect(second.applicationNumber).toBe(2);
    expect(otherCycle.applicationNumber).toBe(1);
    expect(otherUser.applicationNumber).toBe(1);
    expect(first.status).toBe("applied");
    expect(first.sheetSyncStatus).toBe("pending");
  });

  it("lists only the requested cycle, in application order", async () => {
    await log(USER_ONE, "Ramp");
    await log(USER_ONE, "Figma");
    await log(USER_ONE, "Stripe", "F26");

    const result = await service.listApplications(USER_ONE, { cycle: CYCLE });

    expect(result.cycle).toBe(CYCLE);
    expect(result.applications.map((row) => row.company)).toEqual([
      "Ramp",
      "Figma",
    ]);
  });

  it("advances the status and bumps the version", async () => {
    const application = await log(USER_ONE, "Ramp");

    const updated = await service.updateApplication(USER_ONE, application.id, {
      status: "oa_received",
      expectedVersion: application.version,
    });

    expect(updated.status).toBe("oa_received");
    expect(updated.version).toBe(application.version + 1);
  });

  it("rejects a stale write and hides other owners' rows", async () => {
    const application = await log(USER_ONE, "Ramp");
    await service.updateApplication(USER_ONE, application.id, {
      status: "interview",
      expectedVersion: application.version,
    });

    await expect(
      service.updateApplication(USER_ONE, application.id, {
        status: "offer",
        expectedVersion: application.version,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      service.getApplication(USER_TWO, application.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes an application and hides other owners' rows from deletion", async () => {
    const application = await log(USER_ONE, "Ramp");

    await expect(
      service.deleteApplication(USER_TWO, application.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const deleted = await service.deleteApplication(USER_ONE, application.id);
    expect(deleted.id).toBe(application.id);

    await expect(
      service.getApplication(USER_ONE, application.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      service.deleteApplication(USER_ONE, application.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records a sync result without invalidating an open editor", async () => {
    const application = await log(USER_ONE, "Ramp");

    const failed = await service.markSheetSync(USER_ONE, application.id, {
      status: "failed",
      error: "Google Sheets rejected the request",
    });
    expect(failed.sheetSyncStatus).toBe("failed");
    expect(failed.sheetSyncError).toBe("Google Sheets rejected the request");
    expect(failed.version).toBe(application.version);

    const synced = await service.markSheetSync(USER_ONE, application.id, {
      status: "synced",
    });
    expect(synced.sheetSyncError).toBeNull();
    expect(synced.sheetSyncedAt).not.toBeNull();
    expect(synced.version).toBe(application.version);
  });

  it("imports sheet rows idempotently and keeps numbering continuous", async () => {
    const rows = [
      {
        applicationNumber: 1,
        company: "Ramp",
        title: "SWE Intern",
        status: "rejected" as const,
        notes: null,
        appliedOn: "2026-07-01",
      },
      {
        applicationNumber: 2,
        company: "Figma",
        title: "Product Eng Intern",
        status: null,
        notes: "Referral",
        appliedOn: "2026-07-14",
      },
    ];

    expect(await service.importRows(USER_ONE, CYCLE, rows)).toEqual({
      imported: 2,
    });

    // Re-running must update in place rather than duplicate.
    await service.importRows(USER_ONE, CYCLE, [
      { ...rows[0], status: "ghosted" as const },
      rows[1],
    ]);

    const listed = await service.listApplications(USER_ONE, { cycle: CYCLE });
    expect(listed.applications).toHaveLength(2);
    expect(listed.applications[0].status).toBe("ghosted");
    expect(listed.applications[0].sheetSyncStatus).toBe("synced");
    expect(listed.applications[1].status).toBe("applied");

    const next = await log(USER_ONE, "Stripe");
    expect(next.applicationNumber).toBe(3);
  });

  it("stores one Google connection per user and forgets it on disconnect", async () => {
    await service.saveConnection(USER_ONE, {
      googleEmail: "owner@example.com",
      refreshTokenCiphertext: "sealed-one",
      scope: "spreadsheets",
      spreadsheetId: "sheet-id",
    });
    await service.saveConnection(USER_ONE, {
      googleEmail: "owner@example.com",
      refreshTokenCiphertext: "sealed-two",
      scope: "spreadsheets",
      spreadsheetId: "sheet-id",
    });

    const connection = await service.getConnection(USER_ONE);
    expect(connection?.refreshTokenCiphertext).toBe("sealed-two");
    expect(connection?.lastImportedAt).toBeNull();

    await service.markImported(USER_ONE);
    expect(
      (await service.getConnection(USER_ONE))?.lastImportedAt,
    ).not.toBeNull();

    await service.deleteConnection(USER_ONE);
    expect(await service.getConnection(USER_ONE)).toBeNull();
    expect(await service.getConnection(USER_TWO)).toBeNull();
  });
});
