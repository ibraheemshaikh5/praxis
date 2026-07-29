import { NextResponse } from "next/server";

import {
  parseJson,
  parseQuery,
  resolveTaskId,
  routeError,
  type TaskRouteContext,
} from "@/lib/api/routes";
import {
  expectedVersionQuerySchema,
  updateTaskSchema,
} from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: TaskRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const taskId = await resolveTaskId(context);
    const input = await parseJson(request, updateTaskSchema);
    const task = await getDailyPlannerService().updateTask(
      userId,
      taskId,
      input,
    );
    return NextResponse.json({ task });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: TaskRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const taskId = await resolveTaskId(context);
    const { expectedVersion } = parseQuery(request, expectedVersionQuerySchema);
    const task = await getDailyPlannerService().deleteTask(
      userId,
      taskId,
      expectedVersion,
    );
    return NextResponse.json({ task });
  } catch (error) {
    return routeError(error);
  }
}
