import { NextResponse } from "next/server";

import {
  applicationsQuerySchema,
  createApplicationSchema,
} from "@/lib/applications/contracts";
import { getApplicationsService } from "@/lib/applications/runtime";
import { DEFAULT_CYCLE } from "@/lib/applications/service";
import {
  pushApplicationToSheet,
  reconcileBeforeCreate,
} from "@/lib/applications/sync";
import {
  jsonCreated,
  parseJson,
  parseQuery,
  routeError,
} from "@/lib/api/routes";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const query = parseQuery(request, applicationsQuerySchema);
    const result = await getApplicationsService().listApplications(
      userId,
      query,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createApplicationSchema);
    const service = getApplicationsService();

    // Repair the tab's numbering first, so this application cannot take a
    // number an existing unnumbered row is entitled to.
    await reconcileBeforeCreate(userId, input.cycle ?? DEFAULT_CYCLE);

    // Postgres commits first; the spreadsheet is a best-effort mirror.
    const created = await service.createApplication(userId, input);
    const outcome = await pushApplicationToSheet(userId, created);
    const application = outcome
      ? await service.markSheetSync(userId, created.id, outcome)
      : created;

    return jsonCreated({ application });
  } catch (error) {
    return routeError(error);
  }
}
