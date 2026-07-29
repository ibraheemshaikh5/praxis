import { NextResponse } from "next/server";

import {
  parseJson,
  resolveTaskId,
  routeError,
  type TaskRouteContext,
} from "@/lib/api/routes";
import { completionSchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request, context: TaskRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const taskId = await resolveTaskId(context);
    const input = await parseJson(request, completionSchema);
    const task = await getDailyPlannerService().setCompletion(
      userId,
      taskId,
      input,
    );
    return NextResponse.json({ task });
  } catch (error) {
    return routeError(error);
  }
}
