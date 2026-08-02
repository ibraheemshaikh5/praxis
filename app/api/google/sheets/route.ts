import { NextResponse } from "next/server";

import { listSpreadsheetTabs } from "@/lib/applications/sync";
import { routeError } from "@/lib/api/routes";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();
    const tabs = await listSpreadsheetTabs(userId);
    return NextResponse.json({ tabs });
  } catch (error) {
    return routeError(error);
  }
}
