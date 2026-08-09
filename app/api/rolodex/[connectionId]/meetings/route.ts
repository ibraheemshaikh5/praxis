import {
  jsonCreated,
  parseJson,
  resolveConnectionId,
  routeError,
  type ConnectionRouteContext,
} from "@/lib/api/routes";
import { createMeetingSchema } from "@/lib/rolodex/contracts";
import { toConnectionMeetingPayload } from "@/lib/rolodex/payload";
import { getRolodexService } from "@/lib/rolodex/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request, context: ConnectionRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const connectionId = await resolveConnectionId(context);
    const input = await parseJson(request, createMeetingSchema);
    const meeting = await getRolodexService().addMeeting(
      userId,
      connectionId,
      input,
    );

    return jsonCreated({ meeting: toConnectionMeetingPayload(meeting) });
  } catch (error) {
    return routeError(error);
  }
}
