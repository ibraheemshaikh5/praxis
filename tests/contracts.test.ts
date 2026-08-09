import { afterEach, describe, expect, it } from "vitest";

import {
  createTaskSchema,
  plannerRangeQuerySchema,
  reserveAttachmentSchema,
  scheduleTaskSchema,
} from "@/lib/daily-planner/contracts";
import { AuthenticationError } from "@/lib/daily-planner/errors";
import { requireMaintenanceAuthorization } from "@/lib/api/routes";

describe("daily planner contracts", () => {
  it("normalizes task titles and accepts a one-day range", () => {
    expect(
      createTaskSchema.parse({
        title: "  Write tests  ",
        plannerDate: "2026-07-29",
      }),
    ).toMatchObject({ title: "Write tests" });

    expect(
      plannerRangeQuerySchema.parse({
        from: "2026-07-29",
        to: "2026-07-29",
      }),
    ).toMatchObject({ inbox: "false" });
  });

  it("accepts curated task appearance and rejects unknown values", () => {
    expect(
      createTaskSchema.parse({
        title: "Read",
        iconKey: "book",
        colorKey: "sky",
      }),
    ).toMatchObject({ iconKey: "book", colorKey: "sky" });
    expect(() =>
      createTaskSchema.parse({
        title: "Read",
        iconKey: "rocket",
        colorKey: "purple",
      }),
    ).toThrow();
  });

  it("rejects invalid dates and oversized planner ranges", () => {
    expect(() =>
      plannerRangeQuerySchema.parse({
        from: "2026-02-30",
        to: "2026-03-01",
      }),
    ).toThrow();
    expect(() =>
      plannerRangeQuerySchema.parse({
        from: "2026-01-01",
        to: "2026-02-01",
      }),
    ).toThrow();
  });

  it("requires dated, ordered time blocks", () => {
    expect(() =>
      scheduleTaskSchema.parse({
        plannerDate: null,
        startsAt: "2026-07-29T09:00:00-04:00",
        expectedVersion: 1,
      }),
    ).toThrow();
    expect(() =>
      scheduleTaskSchema.parse({
        plannerDate: "2026-07-29",
        startsAt: "2026-07-29T10:00:00-04:00",
        endsAt: "2026-07-29T09:00:00-04:00",
        expectedVersion: 1,
      }),
    ).toThrow();
  });

  it("enforces attachment type and size limits", () => {
    expect(
      reserveAttachmentSchema.parse({
        fileName: "notes.md",
        mimeType: "text/markdown",
        byteSize: 512,
      }),
    ).toBeTruthy();
    expect(() =>
      reserveAttachmentSchema.parse({
        fileName: "archive.zip",
        mimeType: "application/zip",
        byteSize: 512,
      }),
    ).toThrow();
    expect(() =>
      reserveAttachmentSchema.parse({
        fileName: "large.pdf",
        mimeType: "application/pdf",
        byteSize: 26_214_401,
      }),
    ).toThrow();
  });
});

describe("maintenance authorization", () => {
  const originalSecret = process.env.MAINTENANCE_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.MAINTENANCE_SECRET;
    } else {
      process.env.MAINTENANCE_SECRET = originalSecret;
    }
  });

  it("accepts only the configured bearer secret", () => {
    process.env.MAINTENANCE_SECRET = "correct-horse";
    const authorized = new Request("http://localhost/api/internal", {
      headers: { authorization: "Bearer correct-horse" },
    });
    expect(() => requireMaintenanceAuthorization(authorized)).not.toThrow();

    const rejected = new Request("http://localhost/api/internal", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(() => requireMaintenanceAuthorization(rejected)).toThrow(
      AuthenticationError,
    );
  });
});
