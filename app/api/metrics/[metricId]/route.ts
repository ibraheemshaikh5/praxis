import { NextResponse } from "next/server";

import { parseJson, parseUuid, routeError } from "@/lib/api/routes";
import { updateMetricSchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

type MetricRouteContext = {
  params: Promise<{ metricId: string }>;
};

export async function PATCH(request: Request, context: MetricRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const metricId = await resolveMetricId(context);
    const input = await parseJson(request, updateMetricSchema);
    const metric = await getDailyPlannerService().updateMetric(
      userId,
      metricId,
      input,
    );
    return NextResponse.json({ metric });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: MetricRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const metricId = await resolveMetricId(context);
    const metric = await getDailyPlannerService().archiveMetric(
      userId,
      metricId,
    );
    return NextResponse.json({ metric });
  } catch (error) {
    return routeError(error);
  }
}

async function resolveMetricId(context: MetricRouteContext) {
  const { metricId } = await context.params;
  return parseUuid(metricId, "metricId");
}
