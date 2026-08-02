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
  buildRowValues,
  cellValues,
  parseSheetRows,
  resolveHeaderMap,
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
    const headerRow = rows[0] ?? [];
    const headerMap = resolveHeaderMap(headerRow);

    const sheetApplication = {
      applicationNumber: application.applicationNumber,
      company: application.company,
      title: application.title,
      status: application.status,
      notes: application.notes,
      appliedOn: application.appliedOn,
    };

    const rowNumber = findRowNumber(
      rows,
      headerMap.number,
      application.applicationNumber,
    );

    if (rowNumber === null) {
      await context.client.appendRow(
        tab,
        buildRowValues(headerMap, headerRow.length, sheetApplication),
      );
    } else {
      await context.client.updateCells(
        tab,
        rowNumber,
        cellValues(headerMap, sheetApplication),
      );
    }

    return { status: "synced" };
  } catch (error) {
    return { status: "failed", error: describeSyncFailure(error) };
  }
}

export async function importCycleFromSheet(userId: string, cycle: string) {
  const context = await resolveSheetsContext(userId);
  if (!context) throw new GoogleNotConnectedError();

  const rows = await context.client.readTab(cycle);
  const headerMap = resolveHeaderMap(rows[0] ?? []);
  const parsed = parseSheetRows(headerMap, rows.slice(1));

  const service = getApplicationsService();
  const result = await service.importRows(userId, cycle, parsed);
  await service.markImported(userId);

  return { ...result, cycle };
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
