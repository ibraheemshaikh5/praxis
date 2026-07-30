import { NextResponse } from "next/server";

import {
  jsonCreated,
  parseJson,
  parseQuery,
  routeError,
} from "@/lib/api/routes";
import {
  createMetricSchema,
  metricsQuerySchema,
} from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const query = parseQuery(request, metricsQuerySchema);
    const result = await getDailyPlannerService().listMetrics(userId, query);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createMetricSchema);
    const metric = await getDailyPlannerService().createMetric(userId, input);
    return jsonCreated({ metric });
  } catch (error) {
    return routeError(error);
  }
}
