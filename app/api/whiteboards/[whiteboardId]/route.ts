import { NextResponse } from "next/server";

import { parseJson, parseUuid, routeError } from "@/lib/api/routes";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";
import { updateWhiteboardSchema } from "@/lib/whiteboards/contracts";
import { getWhiteboardsService } from "@/lib/whiteboards/runtime";

type WhiteboardRouteContext = {
  params: Promise<{ whiteboardId: string }>;
};

export async function GET(_request: Request, context: WhiteboardRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const whiteboardId = await resolveWhiteboardId(context);
    const result = await getWhiteboardsService().getWhiteboard(
      userId,
      whiteboardId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: WhiteboardRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const whiteboardId = await resolveWhiteboardId(context);
    const input = await parseJson(request, updateWhiteboardSchema);
    const result = await getWhiteboardsService().updateWhiteboard(
      userId,
      whiteboardId,
      input,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: WhiteboardRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const whiteboardId = await resolveWhiteboardId(context);
    const result = await getWhiteboardsService().deleteWhiteboard(
      userId,
      whiteboardId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

async function resolveWhiteboardId(context: WhiteboardRouteContext) {
  const { whiteboardId } = await context.params;
  return parseUuid(whiteboardId, "whiteboardId");
}
