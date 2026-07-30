import { NextResponse } from "next/server";

import {
  parseJson,
  resolveTaskId,
  routeError,
  type TaskRouteContext,
} from "@/lib/api/routes";
import { scheduleTaskSchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request, context: TaskRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const taskId = await resolveTaskId(context);
    const input = await parseJson(request, scheduleTaskSchema);
    const result = await getDailyPlannerService().scheduleTask(
      userId,
      taskId,
      input,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
