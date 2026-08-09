import { NextResponse } from "next/server";

import { routeError } from "@/lib/api/routes";
import { getBuildNotesService } from "@/lib/build-notes/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();
    const result = await getBuildNotesService().listBuildNoteDispatches(userId);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
