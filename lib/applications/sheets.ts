import { ValidationError } from "@/lib/daily-planner/errors";
import { GoogleSyncError } from "@/lib/google/errors";

import { formatStatusLabel, parseStatusLabel } from "./status";
import type { ApplicationStatus } from "./status";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
// Wide enough for any realistic tracker sheet without paging.
const READ_WIDTH = "Z";

export type SheetField =
  "number" | "company" | "title" | "status" | "notes" | "appliedOn";

export type SheetHeaderMap = Record<SheetField, number | null>;

export type SheetRow = {
  applicationNumber: number;
  company: string;
  title: string;
  status: ApplicationStatus | null;
  notes: string | null;
  appliedOn: string | null;
};

export type SheetApplication = {
  applicationNumber: number;
  company: string;
  title: string;
  status: ApplicationStatus;
  notes: string | null;
  appliedOn: string;
};

/**
 * The spreadsheet is the owner's, not ours: columns are matched by reading the
 * header row rather than by position, so reordering or inserting a column in
 * the sheet does not require a code change.
 */
const HEADER_ALIASES: Record<SheetField, string[]> = {
  number: ["#", "no", "num", "number", "index", "count"],
  company: ["company", "companyname", "employer", "organization", "org"],
  title: ["title", "role", "position", "jobtitle", "roletitle"],
  status: ["status", "stage", "result", "outcome"],
  notes: ["notes", "note", "comments", "comment"],
  appliedOn: ["dateapplied", "applieddate", "date", "applied", "appliedon"],
};

const REQUIRED_FIELDS: SheetField[] = ["number", "company", "title"];

/** How each required field is named in the sheet, for error messages. */
const FIELD_HEADINGS: Record<SheetField, string> = {
  number: "#",
  company: "Company",
  title: "Title",
  status: "Status",
  notes: "Notes",
  appliedOn: "Date Applied",
};

export function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9#]/g, "");
}

export function resolveHeaderMap(headerRow: string[]): SheetHeaderMap {
  const normalized = headerRow.map((cell) => normalizeHeader(cell ?? ""));
  const map = {} as SheetHeaderMap;

  for (const field of Object.keys(HEADER_ALIASES) as SheetField[]) {
    const aliases = HEADER_ALIASES[field];
    const index = normalized.findIndex(
      (cell) => cell.length > 0 && aliases.includes(cell),
    );
    map[field] = index === -1 ? null : index;
  }

  const missing = REQUIRED_FIELDS.filter((field) => map[field] === null);
  if (missing.length > 0) {
    const headings = missing.map((field) => FIELD_HEADINGS[field]);
    throw new ValidationError(
      `The sheet is missing the ${headings.join(", ")} column${
        headings.length > 1 ? "s" : ""
      }.`,
    );
  }

  return map;
}

/**
 * The exact spelling each status already has in a given tab, keyed by its
 * normalized form. The tabs are hand-kept and disagree with each other, so a
 * write reuses whatever wording that tab already uses rather than imposing
 * ours; our label is only a fallback for a status the tab has never held.
 */
export type SheetStatusVocabulary = Map<string, string>;

export function resolveStatusVocabulary(
  headerMap: SheetHeaderMap,
  rows: string[][],
): SheetStatusVocabulary {
  const vocabulary: SheetStatusVocabulary = new Map();
  if (headerMap.status === null) return vocabulary;

  for (const row of rows) {
    const raw = cell(row, headerMap.status).trim();
    if (!raw) continue;
    const status = parseStatusLabel(raw);
    if (status && !vocabulary.has(status)) vocabulary.set(status, raw);
  }

  return vocabulary;
}

export function sheetStatusLabel(
  status: ApplicationStatus,
  vocabulary?: SheetStatusVocabulary,
) {
  return vocabulary?.get(status) ?? formatStatusLabel(status);
}

/** The subset of cells a given update touches, keyed by column index. */
export function cellValues(
  headerMap: SheetHeaderMap,
  application: Partial<SheetApplication>,
  vocabulary?: SheetStatusVocabulary,
): Array<[number, string]> {
  const cells: Array<[number, string]> = [];

  function push(field: SheetField, value: string | null | undefined) {
    const index = headerMap[field];
    if (index === null || value === undefined) return;
    cells.push([index, value ?? ""]);
  }

  push(
    "number",
    application.applicationNumber === undefined
      ? undefined
      : String(application.applicationNumber),
  );
  push("company", application.company);
  push("title", application.title);
  push(
    "status",
    application.status === undefined
      ? undefined
      : sheetStatusLabel(application.status, vocabulary),
  );
  push("notes", application.notes);
  push("appliedOn", application.appliedOn);

  return cells;
}

/**
 * The 1-based row a new application belongs in. These sheets carry banded
 * formatting hundreds of rows past the last entry, so appending would insert a
 * fresh row and leave those prepared rows stranded; the first one whose tracked
 * columns are all blank is the row the owner expects to see filled.
 */
export function findWriteRowNumber(
  headerMap: SheetHeaderMap,
  rows: string[][],
): number {
  for (let index = 1; index < rows.length; index += 1) {
    if (isBlankRow(headerMap, rows[index] ?? [])) return index + 1;
  }

  // values.get trims trailing blanks, so the row after the used range is next.
  return Math.max(rows.length, 1) + 1;
}

/** 1-based rows carrying an application that was never given a number. */
export function findUnnumberedRows(
  headerMap: SheetHeaderMap,
  rows: string[][],
): number[] {
  const unnumbered: number[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (isBlankRow(headerMap, row)) continue;
    if (readNumber(headerMap, row) === null) unnumbered.push(index + 1);
  }

  return unnumbered;
}

export function highestNumber(headerMap: SheetHeaderMap, rows: string[][]) {
  let highest = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const value = readNumber(headerMap, rows[index] ?? []);
    if (value !== null) highest = Math.max(highest, value);
  }

  return highest;
}

function readNumber(headerMap: SheetHeaderMap, row: string[]) {
  const raw = cell(row, headerMap.number).trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isBlankRow(headerMap: SheetHeaderMap, row: string[]) {
  return (
    !cell(row, headerMap.number).trim() &&
    !cell(row, headerMap.company).trim() &&
    !cell(row, headerMap.title).trim()
  );
}

export function parseSheetRows(
  headerMap: SheetHeaderMap,
  rows: string[][],
): SheetRow[] {
  const parsed: SheetRow[] = [];

  for (const row of rows) {
    const applicationNumber = Number(cell(row, headerMap.number).trim());
    const company = cell(row, headerMap.company).trim();
    const title = cell(row, headerMap.title).trim();

    // Blank spacer rows and running totals are common in hand-kept sheets.
    if (!Number.isInteger(applicationNumber) || applicationNumber < 1) continue;
    if (!company && !title) continue;

    const notes = cell(row, headerMap.notes).trim();

    parsed.push({
      applicationNumber,
      company: company.slice(0, 200) || "Unknown",
      title: title.slice(0, 200) || "Unknown",
      status: parseStatusLabel(cell(row, headerMap.status)),
      notes: notes ? notes.slice(0, 5000) : null,
      appliedOn: parseSheetDate(cell(row, headerMap.appliedOn)),
    });
  }

  return parsed;
}

/** Accepts the shapes Google renders dates in, plus plain ISO. */
export function parseSheetDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  if (slashed) {
    const [, month, day, rawYear] = slashed;
    const year =
      rawYear.length === 2 ? String(2000 + Number(rawYear)) : rawYear;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function columnLetter(index: number) {
  let remaining = index;
  let letter = "";

  do {
    letter = String.fromCharCode(65 + (remaining % 26)) + letter;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return letter;
}

export function quoteTab(tab: string) {
  return `'${tab.replace(/'/g, "''")}'`;
}

export class SheetsClient {
  constructor(
    private readonly accessToken: string,
    private readonly spreadsheetId: string,
  ) {}

  async readTab(tab: string): Promise<string[][]> {
    const payload = await this.request<{ values?: string[][] }>(
      `/values/${encodeURIComponent(`${quoteTab(tab)}!A1:${READ_WIDTH}`)}`,
    );
    return payload.values ?? [];
  }

  async listTabs(): Promise<string[]> {
    const payload = await this.request<{
      sheets?: Array<{ properties?: { title?: string } }>;
    }>("?fields=sheets.properties.title");

    return (payload.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title));
  }

  /** One range per cell so untouched columns and their formulas survive. */
  async updateCells(
    tab: string,
    rowNumber: number,
    cells: Array<[number, string]>,
  ) {
    if (cells.length === 0) return;

    await this.request("/values:batchUpdate", {
      method: "POST",
      body: {
        valueInputOption: "USER_ENTERED",
        data: cells.map(([index, value]) => {
          const letter = columnLetter(index);
          return {
            range: `${quoteTab(tab)}!${letter}${rowNumber}`,
            values: [[value]],
          };
        }),
      },
    });
  }

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${SHEETS_API}/${this.spreadsheetId}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          ...(init?.body ? { "content-type": "application/json" } : {}),
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
    } catch {
      throw new GoogleSyncError("Could not reach Google Sheets");
    }

    const payload = (await response.json().catch(() => null)) as
      (T & { error?: { message?: string } }) | null;

    if (!response.ok) {
      throw new GoogleSyncError(
        payload?.error?.message ?? "Google Sheets rejected the request",
      );
    }

    return (payload ?? ({} as T)) as T;
  }
}

function cell(row: string[], index: number | null) {
  if (index === null) return "";
  return row[index] ?? "";
}
