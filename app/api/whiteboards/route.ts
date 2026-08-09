import { NextResponse } from "next/server";

import {
  jsonCreated,
  parseJson,
  parseQuery,
  routeError,
} from "@/lib/api/routes";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";
import {
  createWhiteboardSchema,
  whiteboardsQuerySchema,
} from "@/lib/whiteboards/contracts";
import { getWhiteboardsService } from "@/lib/whiteboards/runtime";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const query = parseQuery(request, whiteboardsQuerySchema);
    const result = await getWhiteboardsService().listWhiteboards(userId, query);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createWhiteboardSchema);
    const result = await getWhiteboardsService().createWhiteboard(
      userId,
      input,
    );
    return jsonCreated(result);
  } catch (error) {
    return routeError(error);
  }
}
