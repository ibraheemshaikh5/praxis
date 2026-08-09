import { NextResponse } from "next/server";

import {
  parseJson,
  resolveConnectionId,
  routeError,
  type ConnectionRouteContext,
} from "@/lib/api/routes";
import { updateConnectionSchema } from "@/lib/rolodex/contracts";
import { toConnectionDetailPayload } from "@/lib/rolodex/payload";
import { getRolodexService } from "@/lib/rolodex/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(_request: Request, context: ConnectionRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const connectionId = await resolveConnectionId(context);
    const connection = await getRolodexService().getConnection(
      userId,
      connectionId,
    );

    return NextResponse.json({
      connection: toConnectionDetailPayload(connection),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: ConnectionRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const connectionId = await resolveConnectionId(context);
    const input = await parseJson(request, updateConnectionSchema);
    const connection = await getRolodexService().updateConnection(
      userId,
      connectionId,
      input,
    );

    return NextResponse.json({
      connection: toConnectionDetailPayload(connection),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: ConnectionRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const connectionId = await resolveConnectionId(context);
    const connection = await getRolodexService().deleteConnection(
      userId,
      connectionId,
    );

    return NextResponse.json({
      connection: toConnectionDetailPayload({ ...connection, meetings: [] }),
    });
  } catch (error) {
    return routeError(error);
  }
}
