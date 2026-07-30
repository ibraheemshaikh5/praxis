import { NextResponse } from "next/server";

import {
  parseJson,
  resolveTaskId,
  routeError,
  type TaskRouteContext,
} from "@/lib/api/routes";
import { restoreTaskSchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request, context: TaskRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const taskId = await resolveTaskId(context);
    const { expectedVersion } = await parseJson(request, restoreTaskSchema);
    const task = await getDailyPlannerService().restoreTask(
      userId,
      taskId,
      expectedVersion,
    );
    return NextResponse.json({ task });
  } catch (error) {
    return routeError(error);
  }
}
