import { NextResponse } from "next/server";

import { jsonCreated, parseJson, routeError } from "@/lib/api/routes";
import { createReadingItemSchema } from "@/lib/reading/contracts";
import { resolveCreate } from "@/lib/reading/resolve";
import { getReadingService } from "@/lib/reading/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();
    const result = await getReadingService().listItems(userId);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createReadingItemSchema);

    // The page or the catalogue is read before the row exists, so a card is
    // never saved without whatever image and byline could be found.
    const resolved = await resolveCreate(input);
    const result = await getReadingService().createItem(userId, resolved);

    return jsonCreated(result);
  } catch (error) {
    return routeError(error);
  }
}
