// Twilio rejects a message body longer than this, and the conversation table
// stores no more. iMessage allows far longer, but a planner reply never needs it.
export const SMS_MAX_LENGTH = 1600;

export function truncateSms(body: string) {
  return body.length <= SMS_MAX_LENGTH
    ? body
    : `${body.slice(0, SMS_MAX_LENGTH - 1)}…`;
}
