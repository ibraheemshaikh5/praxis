/**
 * The database stores snake_case enum members; the spreadsheet stores the
 * human labels the owner already types by hand. This module is the only place
 * the two vocabularies meet.
 */

export const APPLICATION_STATUSES = [
  "applied",
  "oa_received",
  "oa_completed",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "ghosted",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  oa_received: "OA Received",
  oa_completed: "OA Completed",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  ghosted: "Ghosted",
};

/** Spellings already present in the sheet that should map onto a status. */
const STATUS_ALIASES: Record<string, ApplicationStatus> = {
  submitted: "applied",
  applied: "applied",
  oa: "oa_received",
  oareceived: "oa_received",
  oarecieved: "oa_received",
  onlineassessment: "oa_received",
  assessment: "oa_received",
  oacompleted: "oa_completed",
  oacomplete: "oa_completed",
  oadone: "oa_completed",
  oasubmitted: "oa_completed",
  interview: "interview",
  interviewing: "interview",
  onsite: "interview",
  finalround: "interview",
  offer: "offer",
  offerreceived: "offer",
  accepted: "accepted",
  accept: "accepted",
  signed: "accepted",
  rejected: "rejected",
  reject: "rejected",
  denied: "rejected",
  declined: "rejected",
  ghosted: "ghosted",
  ghost: "ghosted",
  noresponse: "ghosted",
};

export function normalizeStatusLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Returns null rather than throwing so an odd sheet cell cannot fail import. */
export function parseStatusLabel(value: string | null | undefined) {
  if (!value) return null;
  return STATUS_ALIASES[normalizeStatusLabel(value)] ?? null;
}

export function formatStatusLabel(status: ApplicationStatus) {
  return APPLICATION_STATUS_LABELS[status];
}
