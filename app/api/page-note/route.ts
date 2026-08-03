import { NextResponse } from "next/server";

import { parseJson, parseQuery, routeError } from "@/lib/api/routes";
import {
  pageNoteQuerySchema,
  upsertPageNoteSchema,
} from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const query = parseQuery(request, pageNoteQuerySchema);
    const result = await getDailyPlannerService().getPageNote(userId, query);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, upsertPageNoteSchema);
    const result = await getDailyPlannerService().upsertPageNote(userId, input);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
