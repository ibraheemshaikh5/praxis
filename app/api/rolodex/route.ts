import { NextResponse } from "next/server";

import { jsonCreated, parseJson, routeError } from "@/lib/api/routes";
import { createConnectionSchema } from "@/lib/rolodex/contracts";
import { resolveConnection } from "@/lib/rolodex/enrich";
import { parseConnectionInput } from "@/lib/rolodex/entry";
import {
  toConnectionDetailPayload,
  toConnectionSummaryPayload,
} from "@/lib/rolodex/payload";
import { getRolodexService } from "@/lib/rolodex/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();
    const result = await getRolodexService().listConnections(userId);

    return NextResponse.json({
      connections: result.connections.map(toConnectionSummaryPayload),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { input } = await parseJson(request, createConnectionSchema);

    // The profile is looked up before the row exists, so a card is never saved
    // without whatever name and photo could be found.
    const resolved = await resolveConnection(parseConnectionInput(input));
    const result = await getRolodexService().createConnection(userId, resolved);

    return jsonCreated({
      connection: toConnectionDetailPayload(result.connection),
      duplicate: result.duplicate,
    });
  } catch (error) {
    return routeError(error);
  }
}
