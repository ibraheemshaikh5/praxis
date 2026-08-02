import { NextResponse } from "next/server";

import { getApplicationsService } from "@/lib/applications/runtime";
import { routeError } from "@/lib/api/routes";
import { forgetAccessToken } from "@/lib/google/oauth";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();
    const connection = await getApplicationsService().getConnection(userId);

    // The refresh token never leaves the server.
    return NextResponse.json({
      connection: connection
        ? {
            connected: true,
            googleEmail: connection.googleEmail,
            spreadsheetId: connection.spreadsheetId,
            lastImportedAt: connection.lastImportedAt,
          }
        : {
            connected: false,
            googleEmail: null,
            spreadsheetId: null,
            lastImportedAt: null,
          },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireAuthenticatedUserId();
    await getApplicationsService().deleteConnection(userId);
    forgetAccessToken(userId);

    return NextResponse.json({
      connection: {
        connected: false,
        googleEmail: null,
        spreadsheetId: null,
        lastImportedAt: null,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
