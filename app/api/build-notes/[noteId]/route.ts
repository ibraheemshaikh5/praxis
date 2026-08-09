import { NextResponse } from "next/server";

import { parseJson, parseUuid, routeError } from "@/lib/api/routes";
import { updateBuildNoteSchema } from "@/lib/build-notes/contracts";
import { getBuildNotesService } from "@/lib/build-notes/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

type BuildNoteRouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function PATCH(request: Request, context: BuildNoteRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const noteId = await resolveNoteId(context);
    const input = await parseJson(request, updateBuildNoteSchema);
    const result = await getBuildNotesService().updateBuildNote(
      userId,
      noteId,
      input,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: BuildNoteRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const noteId = await resolveNoteId(context);
    const result = await getBuildNotesService().deleteBuildNote(userId, noteId);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

async function resolveNoteId(context: BuildNoteRouteContext) {
  const { noteId } = await context.params;
  return parseUuid(noteId, "noteId");
}
