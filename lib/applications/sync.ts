import "server-only";

import { PlannerError } from "@/lib/daily-planner/errors";
import type { Application } from "@/lib/db/schema";
import { GoogleNotConnectedError } from "@/lib/google/errors";
import { getAccessToken } from "@/lib/google/oauth";
import { decryptRefreshToken } from "@/lib/google/token-crypto";

import { getApplicationsService } from "./runtime";
import type { SheetSyncOutcome } from "./service";
import {
  SheetsClient,
  cellValues,
  clearedCells,
  findUnnumberedRows,
  findWriteRowNumber,
  highestNumber,
  parseSheetRows,
  resolveHeaderMap,
  resolveStatusVocabulary,
} from "./sheets";

type SheetsContext = {
  client: SheetsClient;
  spreadsheetId: string;
};

export async function resolveSheetsContext(
  userId: string,
): Promise<SheetsContext | null> {
  const service = getApplicationsService();
  const connection = await service.getConnection(userId);
  if (!connection) return null;

  const spreadsheetId =
    connection.spreadsheetId ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new GoogleNotConnectedError(
      "No spreadsheet is configured. Set GOOGLE_SHEETS_SPREADSHEET_ID.",
    );
  }

  const accessToken = await getAccessToken(
    userId,
    decryptRefreshToken(connection.refreshTokenCiphertext),
  );

  return {
    client: new SheetsClient(accessToken, spreadsheetId),
    spreadsheetId,
  };
}

export async function listSpreadsheetTabs(userId: string) {
  const context = await resolveSheetsContext(userId);
  if (!context) throw new GoogleNotConnectedError();
  return context.client.listTabs();
}

/**
 * Brings the tab's own numbering back into shape before anything reads from it:
 * every row carrying an application but no "#" is given the next number, in
 * sheet order. Without this a new application could reuse a number that an
 * existing row is silently entitled to.
 *
 * Returns the parsed rows so callers can import without re-reading.
 */
export async function reconcileNumbering(
  userId: string,
  cycle: string,
  context: SheetsContext,
) {
  const rows = await context.client.readTab(cycle);
  const headerMap = resolveHeaderMap(rows[0] ?? []);
  const unnumbered = findUnnumberedRows(headerMap, rows);

  if (unnumbered.length > 0 && headerMap.number !== null) {
    let next = highestNumber(headerMap, rows) + 1;

    for (const rowNumber of unnumbered) {
      await context.client.updateCells(cycle, rowNumber, [
        [headerMap.number, String(next)],
      ]);
      // Keep the in-memory copy in step so the parse below sees the new number.
      const row = (rows[rowNumber - 1] ??= []);
      row[headerMap.number] = String(next);
      next += 1;
    }
  }

  return { rows, headerMap, repaired: unnumbered.length };
}

/**
 * Run before assigning a number to a new application: repairs the tab's own
 * numbering and pulls the result into Postgres, so `max + 1` accounts for rows
 * that only exist in the sheet. Best effort — a Google outage must not stop the
 * owner from logging an application.
 */
export async function reconcileBeforeCreate(userId: string, cycle: string) {
  try {
    const context = await resolveSheetsContext(userId);
    if (!context) return;

    const { rows, headerMap } = await reconcileNumbering(
      userId,
      cycle,
      context,
    );
    await getApplicationsService().importRows(
      userId,
      cycle,
      parseSheetRows(headerMap, rows.slice(1)),
    );
  } catch (error) {
    console.error("Could not reconcile sheet numbering before create", error);
  }
}

/**
 * Best-effort push of one application into its cycle tab. Postgres has already
 * committed by the time this runs, so a failure is recorded on the row rather
 * than raised — the owner retries from the table.
 *
 * Returns null when no Google account is connected, which leaves the row in
 * its `pending` state instead of flagging a failure the owner cannot fix.
 */
export async function pushApplicationToSheet(
  userId: string,
  application: Application,
): Promise<SheetSyncOutcome | null> {
  try {
    const context = await resolveSheetsContext(userId);
    if (!context) return null;

    const tab = application.cycle;
    const rows = await context.client.readTab(tab);
    const headerMap = resolveHeaderMap(rows[0] ?? []);
    const vocabulary = resolveStatusVocabulary(headerMap, rows);

    const cells = cellValues(
      headerMap,
      {
        applicationNumber: application.applicationNumber,
        company: application.company,
        title: application.title,
        status: application.status,
        notes: application.notes,
        appliedOn: application.appliedOn,
      },
      vocabulary,
    );

    const existingRow = findRowNumber(
      rows,
      headerMap.number,
      application.applicationNumber,
    );

    await context.client.updateCells(
      tab,
      existingRow ?? findWriteRowNumber(headerMap, rows),
      cells,
    );

    return { status: "synced" };
  } catch (error) {
    return { status: "failed", error: describeSyncFailure(error) };
  }
}

/**
 * Best-effort clear of a deleted application's row. Postgres has already
 * deleted the row by the time this runs, so a failure is reported to the
 * caller rather than raised — the row stays in Postgres, deleted, either way.
 *
 * Blanking the row rather than removing it keeps every other row's position
 * intact and leaves the row eligible for `findWriteRowNumber` to reuse, the
 * same as any other blank row in a hand-kept sheet.
 *
 * Returns null when no Google account is connected, and `synced` when the
 * application was never written to the tab in the first place.
 */
export async function clearApplicationFromSheet(
  userId: string,
  application: Pick<Application, "cycle" | "applicationNumber">,
): Promise<SheetSyncOutcome | null> {
  try {
    const context = await resolveSheetsContext(userId);
    if (!context) return null;

    const tab = application.cycle;
    const rows = await context.client.readTab(tab);
    const headerMap = resolveHeaderMap(rows[0] ?? []);

    const rowNumber = findRowNumber(
      rows,
      headerMap.number,
      application.applicationNumber,
    );
    if (rowNumber === null) return { status: "synced" };

    await context.client.updateCells(tab, rowNumber, clearedCells(headerMap));
    return { status: "synced" };
  } catch (error) {
    return { status: "failed", error: describeSyncFailure(error) };
  }
}

export async function importCycleFromSheet(userId: string, cycle: string) {
  const context = await resolveSheetsContext(userId);
  if (!context) throw new GoogleNotConnectedError();

  const { rows, headerMap, repaired } = await reconcileNumbering(
    userId,
    cycle,
    context,
  );
  const parsed = parseSheetRows(headerMap, rows.slice(1));

  const service = getApplicationsService();
  const result = await service.importRows(userId, cycle, parsed);
  await service.markImported(userId);

  return { ...result, cycle, repaired };
}

/** Row numbers are 1-based and include the header row. */
function findRowNumber(
  rows: string[][],
  numberIndex: number | null,
  applicationNumber: number,
) {
  if (numberIndex === null) return null;

  for (let index = 1; index < rows.length; index += 1) {
    const value = Number((rows[index]?.[numberIndex] ?? "").trim());
    if (value === applicationNumber) return index + 1;
  }

  return null;
}

function describeSyncFailure(error: unknown) {
  if (error instanceof PlannerError) return error.message;
  console.error("Google Sheets sync failed", error);
  return "The spreadsheet could not be updated.";
}
