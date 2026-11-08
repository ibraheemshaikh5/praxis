// The conversation table stores no more than this, and SMS fallback splits
// anything longer. iMessage allows far more, but a planner reply never needs it.
export const SMS_MAX_LENGTH = 1600;

// Matches the sms_messages.tool_log check constraint.
export const TOOL_LOG_MAX_LENGTH = 8000;

export function truncateSms(body: string) {
  return body.length <= SMS_MAX_LENGTH
    ? body
    : `${body.slice(0, SMS_MAX_LENGTH - 1)}…`;
}

/** Keeps the end of the log: the latest tool calls matter most for "undo". */
export function truncateToolLog(log: string) {
  return log.length <= TOOL_LOG_MAX_LENGTH
    ? log
    : log.slice(log.length - TOOL_LOG_MAX_LENGTH);
}
