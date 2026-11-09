import "server-only";

import type { CreateApplicationInput } from "./contracts";
import { getApplicationsService } from "./runtime";
import { DEFAULT_CYCLE } from "./service";
import { pushApplicationToSheet, reconcileBeforeCreate } from "./sync";

/**
 * Creates an application and mirrors it to the cycle's spreadsheet tab.
 * Postgres commits first; the spreadsheet is a best-effort mirror.
 */
export async function createAndSyncApplication(
  userId: string,
  input: CreateApplicationInput,
) {
  const service = getApplicationsService();

  // Repair the tab's numbering first, so this application cannot take a
  // number an existing unnumbered row is entitled to.
  await reconcileBeforeCreate(userId, input.cycle ?? DEFAULT_CYCLE);

  const created = await service.createApplication(userId, input);
  const outcome = await pushApplicationToSheet(userId, created);
  return outcome
    ? await service.markSheetSync(userId, created.id, outcome)
    : created;
}
