import {
  jsonCreated,
  parseJson,
  resolveTaskId,
  routeError,
  type TaskRouteContext,
} from "@/lib/api/routes";
import { reserveAttachmentSchema } from "@/lib/daily-planner/contracts";
import { getDailyPlannerService } from "@/lib/daily-planner/runtime";
import { createAdminAttachmentStorage } from "@/lib/supabase/admin-storage";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request, context: TaskRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const taskId = await resolveTaskId(context);
    const input = await parseJson(request, reserveAttachmentSchema);
    const attachment = await getDailyPlannerService().reserveAttachment(
      userId,
      taskId,
      input,
    );
    const upload = await createAdminAttachmentStorage().createUploadTarget(
      attachment.storagePath,
    );
    return jsonCreated({ attachment, upload });
  } catch (error) {
    return routeError(error);
  }
}
