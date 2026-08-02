import { NextResponse } from "next/server";

import { importApplicationsSchema } from "@/lib/applications/contracts";
import { DEFAULT_CYCLE } from "@/lib/applications/service";
import { importCycleFromSheet } from "@/lib/applications/sync";
import { parseJson, routeError } from "@/lib/api/routes";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, importApplicationsSchema);
    const result = await importCycleFromSheet(
      userId,
      input.cycle ?? DEFAULT_CYCLE,
    );
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
