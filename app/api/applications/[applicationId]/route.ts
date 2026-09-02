import { NextResponse } from "next/server";

import { updateApplicationSchema } from "@/lib/applications/contracts";
import { getApplicationsService } from "@/lib/applications/runtime";
import { pushApplicationToSheet } from "@/lib/applications/sync";
import {
  parseJson,
  resolveApplicationId,
  routeError,
  type ApplicationRouteContext,
} from "@/lib/api/routes";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  context: ApplicationRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const applicationId = await resolveApplicationId(context);
    const input = await parseJson(request, updateApplicationSchema);
    const service = getApplicationsService();

    const updated = await service.updateApplication(
      userId,
      applicationId,
      input,
    );
    const outcome = await pushApplicationToSheet(userId, updated);
    const application = outcome
      ? await service.markSheetSync(userId, applicationId, outcome)
      : updated;

    return NextResponse.json({ application });
  } catch (error) {
    return routeError(error);
  }
}
