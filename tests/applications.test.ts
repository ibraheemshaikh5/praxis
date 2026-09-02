import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applicationsQuerySchema,
  createApplicationSchema,
  updateApplicationSchema,
} from "@/lib/applications/contracts";
import {
  cellValues,
  clearedCells,
  columnLetter,
  findUnnumberedRows,
  findWriteRowNumber,
  highestNumber,
  parseSheetDate,
  parseSheetRows,
  resolveHeaderMap,
  resolveStatusVocabulary,
  sheetStatusLabel,
} from "@/lib/applications/sheets";
import {
  APPLICATION_STATUS_LABELS,
  parseStatusLabel,
} from "@/lib/applications/status";
import { ValidationError } from "@/lib/daily-planner/errors";
import {
  createStateNonce,
  decryptRefreshToken,
  encryptRefreshToken,
  matchesStateNonce,
} from "@/lib/google/token-crypto";

// The live S27 tab, verbatim.
const S27_HEADERS = [
  "#",
  "Company",
  "Title",
  "Status",
  "Notes",
  "Date Applied",
];

describe("application contracts", () => {
  it("trims text and keeps the cycle verbatim", () => {
    expect(
      createApplicationSchema.parse({
        cycle: "S27",
        company: "  Ramp  ",
        title: "  Software Engineer Intern ",
        appliedOn: "2026-08-02",
      }),
    ).toMatchObject({
      cycle: "S27",
      company: "Ramp",
      title: "Software Engineer Intern",
    });

    expect(applicationsQuerySchema.parse({})).toEqual({ cycle: undefined });
  });

  it("accepts any tab name as a cycle", () => {
    // The owner's real tabs; a cycle names one verbatim, casing and all.
    for (const cycle of [
      "S27",
      "F25/W26 Internship",
      "YC Automator Batch 1",
      "Sheet6",
    ]) {
      expect(
        createApplicationSchema.parse({
          cycle,
          company: "Ramp",
          title: "Intern",
          appliedOn: "2026-08-02",
        }),
      ).toMatchObject({ cycle });
    }

    expect(() =>
      createApplicationSchema.parse({
        cycle: "  ",
        company: "Ramp",
        title: "Intern",
        appliedOn: "2026-08-02",
      }),
    ).toThrow();
  });

  it("rejects invalid dates and empty updates", () => {
    expect(() =>
      createApplicationSchema.parse({
        company: "Ramp",
        title: "Intern",
        appliedOn: "2026-02-30",
      }),
    ).toThrow();

    expect(() =>
      updateApplicationSchema.parse({ expectedVersion: 1 }),
    ).toThrow();
    expect(
      updateApplicationSchema.parse({
        status: "interview",
        expectedVersion: 3,
      }),
    ).toMatchObject({ status: "interview", expectedVersion: 3 });
  });
});

describe("status labels", () => {
  it("round-trips every label", () => {
    for (const [status, label] of Object.entries(APPLICATION_STATUS_LABELS)) {
      expect(parseStatusLabel(label)).toBe(status);
    }
  });

  it("absorbs the spellings a hand-kept sheet accumulates", () => {
    expect(parseStatusLabel("oa")).toBe("oa_received");
    expect(parseStatusLabel("  OA  Recieved ")).toBe("oa_received");
    expect(parseStatusLabel("Online Assessment")).toBe("oa_received");
    expect(parseStatusLabel("no response")).toBe("ghosted");
    expect(parseStatusLabel("")).toBeNull();
    expect(parseStatusLabel("something else")).toBeNull();
  });
});

describe("sheet header mapping", () => {
  it("maps the current S27 headers", () => {
    expect(resolveHeaderMap(S27_HEADERS)).toEqual({
      number: 0,
      company: 1,
      title: 2,
      status: 3,
      notes: 4,
      appliedOn: 5,
    });
  });

  it("follows reordered, renamed, and interleaved columns", () => {
    expect(
      resolveHeaderMap([
        "Date Applied",
        "Employer",
        "Referral",
        "Role",
        "No.",
        "Stage",
      ]),
    ).toEqual({
      number: 4,
      company: 1,
      title: 3,
      status: 5,
      notes: null,
      appliedOn: 0,
    });
  });

  it("refuses a sheet without the identifying columns", () => {
    expect(() => resolveHeaderMap(["Company", "Title"])).toThrow(
      ValidationError,
    );
    expect(() => resolveHeaderMap([])).toThrow(/#, Company, Title columns/);
  });
});

describe("row building", () => {
  const headerMap = resolveHeaderMap(S27_HEADERS);
  const application = {
    applicationNumber: 42,
    company: "Ramp",
    title: "Software Engineer Intern",
    status: "oa_received" as const,
    notes: "Referral from Priya",
    appliedOn: "2026-08-02",
  };

  it("places every value under its own header", () => {
    expect(cellValues(headerMap, application)).toEqual([
      [0, "42"],
      [1, "Ramp"],
      [2, "Software Engineer Intern"],
      [3, "OA Received"],
      [4, "Referral from Priya"],
      [5, "2026-08-02"],
    ]);
  });

  it("leaves columns the tracker does not own untouched", () => {
    const wide = resolveHeaderMap([...S27_HEADERS, "Resume", "Contact"]);
    const columns = cellValues(wide, application).map(([index]) => index);

    expect(columns).not.toContain(6);
    expect(columns).not.toContain(7);
  });

  it("emits only the cells an update touches", () => {
    expect(cellValues(headerMap, { status: "rejected" })).toEqual([
      [3, "Rejected"],
    ]);
    expect(cellValues(headerMap, { notes: null })).toEqual([[4, ""]]);
  });

  it("numbers columns the way A1 notation does", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(51)).toBe("AZ");
  });

  it("blanks every mapped column when clearing a deleted row", () => {
    expect(clearedCells(headerMap)).toEqual([
      [0, ""],
      [1, ""],
      [2, ""],
      [3, ""],
      [4, ""],
      [5, ""],
    ]);
  });

  it("skips columns the tracker never found when clearing", () => {
    const narrow = resolveHeaderMap(["#", "Company", "Title"]);
    expect(clearedCells(narrow)).toEqual([
      [0, ""],
      [1, ""],
      [2, ""],
    ]);
  });
});

describe("write targeting", () => {
  const headerMap = resolveHeaderMap(S27_HEADERS);

  it("fills the first blank row rather than the end of the sheet", () => {
    // values.get trims trailing blanks, so a full block means "next row".
    expect(
      findWriteRowNumber(headerMap, [
        S27_HEADERS,
        ["1", "Ramp", "SWE Intern", "Applied", "", "2026-08-01"],
        ["2", "Figma", "PM Intern", "Applied", "", "2026-08-02"],
      ]),
    ).toBe(4);

    // A hole left mid-sheet is the row the owner expects to be filled.
    expect(
      findWriteRowNumber(headerMap, [
        S27_HEADERS,
        ["1", "Ramp", "SWE Intern"],
        ["", "", ""],
        ["3", "Figma", "PM Intern"],
      ]),
    ).toBe(3);
  });

  it("writes below the header when the sheet is empty", () => {
    expect(findWriteRowNumber(headerMap, [S27_HEADERS])).toBe(2);
    expect(findWriteRowNumber(headerMap, [])).toBe(2);
  });

  it("finds rows carrying an application but no number", () => {
    const rows = [
      S27_HEADERS,
      ["1", "Ramp", "SWE Intern"],
      ["", "Figma", "PM Intern"],
      ["", "", ""],
      ["", "Stripe", "Intern"],
    ];

    expect(findUnnumberedRows(headerMap, rows)).toEqual([3, 5]);
    expect(highestNumber(headerMap, rows)).toBe(1);
  });
});

describe("status vocabulary", () => {
  const headerMap = resolveHeaderMap(S27_HEADERS);

  it("reuses the spelling the tab already uses", () => {
    const vocabulary = resolveStatusVocabulary(headerMap, [
      S27_HEADERS,
      ["1", "Ramp", "SWE", "OA Recieved"],
      ["2", "Figma", "PM", "applied"],
    ]);

    expect(sheetStatusLabel("oa_received", vocabulary)).toBe("OA Recieved");
    expect(sheetStatusLabel("applied", vocabulary)).toBe("applied");
    // Never used in this tab, so our own label is the only sensible choice.
    expect(sheetStatusLabel("interview", vocabulary)).toBe("Interview");
  });

  it("writes the sheet's wording through cellValues", () => {
    const vocabulary = resolveStatusVocabulary(headerMap, [
      S27_HEADERS,
      ["1", "Ramp", "SWE", "OA Recieved"],
    ]);

    expect(
      cellValues(headerMap, { status: "oa_received" }, vocabulary),
    ).toEqual([[3, "OA Recieved"]]);
  });

  it("falls back to our labels when the tab has no history", () => {
    const vocabulary = resolveStatusVocabulary(headerMap, [S27_HEADERS]);
    expect(sheetStatusLabel("rejected", vocabulary)).toBe("Rejected");
  });
});

describe("row parsing", () => {
  const headerMap = resolveHeaderMap(S27_HEADERS);

  it("reads rows and skips spacers and totals", () => {
    expect(
      parseSheetRows(headerMap, [
        ["1", "Ramp", "SWE Intern", "Applied", "", "8/2/2026"],
        [],
        ["", "Total", "", "", "", ""],
        ["3", "Figma", "Product Eng Intern", "OA", "Due Friday", "2026-08-01"],
      ]),
    ).toEqual([
      {
        applicationNumber: 1,
        company: "Ramp",
        title: "SWE Intern",
        status: "applied",
        notes: null,
        appliedOn: "2026-08-02",
      },
      {
        applicationNumber: 3,
        company: "Figma",
        title: "Product Eng Intern",
        status: "oa_received",
        notes: "Due Friday",
        appliedOn: "2026-08-01",
      },
    ]);
  });

  it("survives short rows and unmapped columns", () => {
    const partial = resolveHeaderMap(["#", "Company", "Title"]);
    expect(parseSheetRows(partial, [["7", "Stripe", "Intern"]])).toEqual([
      {
        applicationNumber: 7,
        company: "Stripe",
        title: "Intern",
        status: null,
        notes: null,
        appliedOn: null,
      },
    ]);
  });

  it("parses the date shapes Google renders", () => {
    expect(parseSheetDate("2026-08-02")).toBe("2026-08-02");
    expect(parseSheetDate("8/2/2026")).toBe("2026-08-02");
    expect(parseSheetDate("08/02/26")).toBe("2026-08-02");
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("sometime")).toBeNull();
  });
});

describe("google refresh token storage", () => {
  const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  afterEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
  });

  it("round-trips a token and never repeats a ciphertext", () => {
    const token = "1//0gRefreshTokenExample";
    const sealed = encryptRefreshToken(token);

    expect(sealed).not.toContain(token);
    expect(sealed.split(":")).toHaveLength(3);
    expect(decryptRefreshToken(sealed)).toBe(token);
    expect(encryptRefreshToken(token)).not.toBe(sealed);
  });

  it("rejects tampered ciphertext and a malformed key", () => {
    const sealed = encryptRefreshToken("secret");
    const [iv, tag, ciphertext] = sealed.split(":");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;

    expect(() =>
      decryptRefreshToken(`${iv}:${tag}:${flipped.toString("base64")}`),
    ).toThrow();
    expect(() => decryptRefreshToken("not-sealed")).toThrow(/malformed/);

    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encryptRefreshToken("secret")).toThrow(/32 bytes/);
  });

  it("compares state nonces without leaking length mismatches", () => {
    const nonce = createStateNonce();

    expect(matchesStateNonce(nonce, nonce)).toBe(true);
    expect(matchesStateNonce(nonce, `${nonce}x`)).toBe(false);
    expect(matchesStateNonce("", "")).toBe(false);
  });
});
