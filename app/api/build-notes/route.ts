import { NextResponse } from "next/server";

import {
  jsonCreated,
  parseJson,
  parseQuery,
  routeError,
} from "@/lib/api/routes";
import {
  buildNotesQuerySchema,
  createBuildNoteSchema,
} from "@/lib/build-notes/contracts";
import { getBuildNotesService } from "@/lib/build-notes/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const query = parseQuery(request, buildNotesQuerySchema);
    const result = await getBuildNotesService().listBuildNotes(userId, query);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createBuildNoteSchema);
    const result = await getBuildNotesService().createBuildNote(userId, input);
    return jsonCreated(result);
  } catch (error) {
    return routeError(error);
  }
}
