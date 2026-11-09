import { NextResponse } from "next/server";

import {
  applicationsQuerySchema,
  createApplicationSchema,
} from "@/lib/applications/contracts";
import { createAndSyncApplication } from "@/lib/applications/create";
import { getApplicationsService } from "@/lib/applications/runtime";
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
    const application = await createAndSyncApplication(userId, input);

    return jsonCreated({ application });
  } catch (error) {
    return routeError(error);
  }
}
