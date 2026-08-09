import type {
  ConnectionDetailPayload,
  ConnectionMeetingPayload,
  ConnectionSummaryPayload,
} from "@/lib/api/types";
import type { Connection, ConnectionMeeting } from "@/lib/db/schema";

/**
 * Route handlers serialize timestamps on the way out; a server component hands
 * the row to the client directly, so it converts them here instead.
 */
export function toConnectionDetailPayload(
  connection: Connection & { meetings: ConnectionMeeting[] },
): ConnectionDetailPayload {
  return {
    ...connection,
    meetings: connection.meetings.map(toConnectionMeetingPayload),
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export function toConnectionSummaryPayload(
  connection: Connection & { lastMetOn: string | null; meetingCount: number },
): ConnectionSummaryPayload {
  return {
    ...connection,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export function toConnectionMeetingPayload(
  meeting: ConnectionMeeting,
): ConnectionMeetingPayload {
  return {
    ...meeting,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
  };
}
