import { NextResponse } from "next/server";

import {
  parseJson,
  resolveKnowledgeItemId,
  routeError,
  type KnowledgeItemRouteContext,
} from "@/lib/api/routes";
import { updateKnowledgeItemSchema } from "@/lib/knowledge/contracts";
import { getKnowledgeService } from "@/lib/knowledge/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: KnowledgeItemRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const itemId = await resolveKnowledgeItemId(context);
    const item = await getKnowledgeService().getItem(userId, itemId);
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(
  request: Request,
  context: KnowledgeItemRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const itemId = await resolveKnowledgeItemId(context);
    const input = await parseJson(request, updateKnowledgeItemSchema);
    const item = await getKnowledgeService().updateItem(userId, itemId, input);
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: KnowledgeItemRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const itemId = await resolveKnowledgeItemId(context);
    const item = await getKnowledgeService().deleteItem(userId, itemId);
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}
