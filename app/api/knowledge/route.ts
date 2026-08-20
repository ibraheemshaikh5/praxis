import { NextResponse } from "next/server";

import { jsonCreated, parseJson, routeError } from "@/lib/api/routes";
import { createKnowledgeItemSchema } from "@/lib/knowledge/contracts";
import { resolveCreate } from "@/lib/knowledge/resolve";
import { getKnowledgeService } from "@/lib/knowledge/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();
    const result = await getKnowledgeService().listItems(userId);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createKnowledgeItemSchema);

    // The page or the catalogue is read before the row exists, so a card is
    // never saved without whatever image and byline could be found.
    const resolved = await resolveCreate(input);
    const result = await getKnowledgeService().createItem(userId, resolved);

    return jsonCreated(result);
  } catch (error) {
    return routeError(error);
  }
}
