import { NextResponse } from "next/server";

import {
  parseJson,
  resolveReadingItemId,
  routeError,
  type ReadingItemRouteContext,
} from "@/lib/api/routes";
import { updateReadingItemSchema } from "@/lib/reading/contracts";
import { getReadingService } from "@/lib/reading/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(_request: Request, context: ReadingItemRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const itemId = await resolveReadingItemId(context);
    const item = await getReadingService().getItem(userId, itemId);
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(
  request: Request,
  context: ReadingItemRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const itemId = await resolveReadingItemId(context);
    const input = await parseJson(request, updateReadingItemSchema);
    const item = await getReadingService().updateItem(userId, itemId, input);
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: ReadingItemRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const itemId = await resolveReadingItemId(context);
    const item = await getReadingService().deleteItem(userId, itemId);
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}
