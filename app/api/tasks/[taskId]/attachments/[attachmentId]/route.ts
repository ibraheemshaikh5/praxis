import { NextResponse } from "next/server";

import {
  resolveAttachmentIds,
  routeError,
  type AttachmentRouteContext,
} from "@/lib/api/routes";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  context: AttachmentRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { attachmentId, taskId } = await resolveAttachmentIds(context);
    const attachment = await getDailyPlannerService().deleteAttachment(
      userId,
      taskId,
      attachmentId,
    );
    return NextResponse.json({ attachment });
  } catch (error) {
    return routeError(error);
  }
}
