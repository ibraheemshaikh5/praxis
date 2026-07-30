import { NextResponse } from "next/server";

import { requireMaintenanceAuthorization, routeError } from "@/lib/api/routes";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { createAdminAttachmentStorage } from "@/lib/supabase/admin-storage";

export async function POST(request: Request) {
  try {
    requireMaintenanceAuthorization(request);
    const result = await getDailyPlannerService().purgeExpired(
      createAdminAttachmentStorage(),
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
