import { NextResponse } from "next/server";

import {
  resolveAttachmentIds,
  routeError,
  type AttachmentRouteContext,
} from "@/lib/api/routes";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { createAdminAttachmentStorage } from "@/lib/supabase/admin-storage";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(_request: Request, context: AttachmentRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { attachmentId, taskId } = await resolveAttachmentIds(context);
    const attachment = await getDailyPlannerService().confirmAttachment(
      userId,
      taskId,
      attachmentId,
      createAdminAttachmentStorage(),
    );
    return NextResponse.json({ attachment });
  } catch (error) {
    return routeError(error);
  }
}
