export const TASK_ICON_KEYS = [
  "check",
  "briefcase",
  "book",
  "dumbbell",
  "heart",
  "leaf",
  "utensils",
  "sparkles",
] as const;

export const TASK_COLOR_KEYS = [
  "olive",
  "sage",
  "apricot",
  "rose",
  "sky",
  "ink",
] as const;

export type TaskIconKey = (typeof TASK_ICON_KEYS)[number];
export type TaskColorKey = (typeof TASK_COLOR_KEYS)[number];

export const DEFAULT_TASK_ICON: TaskIconKey = "check";
export const DEFAULT_TASK_COLOR: TaskColorKey = "olive";
