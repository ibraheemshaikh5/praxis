import { NextResponse } from "next/server";

import { parseJson, routeError } from "@/lib/api/routes";
import { dispatchBuildNotesSchema } from "@/lib/build-notes/contracts";
import { getBuildNotesService } from "@/lib/build-notes/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, dispatchBuildNotesSchema);
    const result = await getBuildNotesService().dispatchBuildNotes(
      userId,
      input,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
