import { NextResponse } from "next/server";

import {
  parseJson,
  resolveConnectionMeetingIds,
  routeError,
  type ConnectionMeetingRouteContext,
} from "@/lib/api/routes";
import { updateMeetingSchema } from "@/lib/rolodex/contracts";
import { toConnectionMeetingPayload } from "@/lib/rolodex/payload";
import { getRolodexService } from "@/lib/rolodex/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  context: ConnectionMeetingRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { connectionId, meetingId } =
      await resolveConnectionMeetingIds(context);
    const input = await parseJson(request, updateMeetingSchema);
    const meeting = await getRolodexService().updateMeeting(
      userId,
      connectionId,
      meetingId,
      input,
    );

    return NextResponse.json({ meeting: toConnectionMeetingPayload(meeting) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: ConnectionMeetingRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { connectionId, meetingId } =
      await resolveConnectionMeetingIds(context);
    const meeting = await getRolodexService().deleteMeeting(
      userId,
      connectionId,
      meetingId,
    );

    return NextResponse.json({ meeting: toConnectionMeetingPayload(meeting) });
  } catch (error) {
    return routeError(error);
  }
}
