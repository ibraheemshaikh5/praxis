import { NextResponse } from "next/server";

import { parseJson, routeError } from "@/lib/api/routes";
import { reorderPlannerSchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, reorderPlannerSchema);
    const result = await getDailyPlannerService().reorderPlanner(userId, input);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
