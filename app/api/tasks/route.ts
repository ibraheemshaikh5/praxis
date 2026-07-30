import { jsonCreated, parseJson, routeError } from "@/lib/api/routes";
import { createTaskSchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createTaskSchema);
    const result = await getDailyPlannerService().createTask(userId, input);
    return jsonCreated(result);
  } catch (error) {
    return routeError(error);
  }
}
