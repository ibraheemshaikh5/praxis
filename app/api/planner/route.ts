import { NextResponse } from "next/server";

import { parseQuery, routeError } from "@/lib/api/routes";
import { plannerRangeQuerySchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const query = parseQuery(request, plannerRangeQuerySchema);
    const planner = await getDailyPlannerService().listPlanner(userId, query);
    return NextResponse.json(planner);
  } catch (error) {
    return routeError(error);
  }
}
