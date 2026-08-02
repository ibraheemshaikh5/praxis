import { NextResponse } from "next/server";

import { getApplicationsService } from "@/lib/applications/runtime";
import { pushApplicationToSheet } from "@/lib/applications/sync";
import {
  resolveApplicationId,
  routeError,
  type ApplicationRouteContext,
} from "@/lib/api/routes";
import { GoogleNotConnectedError } from "@/lib/google/errors";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: ApplicationRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const applicationId = await resolveApplicationId(context);
    const service = getApplicationsService();

    const existing = await service.getApplication(userId, applicationId);
    const outcome = await pushApplicationToSheet(userId, existing);
    if (!outcome) throw new GoogleNotConnectedError();

    const application = await service.markSheetSync(
      userId,
      applicationId,
      outcome,
    );

    return NextResponse.json({ application });
  } catch (error) {
    return routeError(error);
  }
}
