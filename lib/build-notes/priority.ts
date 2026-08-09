export const BUILD_NOTE_PRIORITIES = ["p0", "p1", "p2", "p3"] as const;

export type BuildNotePriority = (typeof BUILD_NOTE_PRIORITIES)[number];

export const BUILD_NOTE_STATUSES = ["open", "dispatched", "done"] as const;

export type BuildNoteStatus = (typeof BUILD_NOTE_STATUSES)[number];

export const DEFAULT_BUILD_NOTE_PRIORITY: BuildNotePriority = "p2";

export const PRIORITY_LABELS: Record<BuildNotePriority, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export function comparePriority(a: BuildNotePriority, b: BuildNotePriority) {
  return BUILD_NOTE_PRIORITIES.indexOf(a) - BUILD_NOTE_PRIORITIES.indexOf(b);
}
