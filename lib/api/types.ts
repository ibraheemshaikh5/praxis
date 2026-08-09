/**
 * Wire shapes for the planner API. Timestamps arrive as ISO strings because
 * Drizzle `Date` values are JSON serialized on the way out; `plannerDate`
 * stays a `YYYY-MM-DD` calendar string.
 */

import type {
  BuildNotePriority,
  BuildNoteStatus,
} from "@/lib/build-notes/priority";

export type AttachmentUploadStatus = "pending" | "ready" | "failed";

export type PlannerEntryClosureReason = "moved" | "unscheduled";

export type TaskAttachmentPayload = {
  id: string;
  taskId: string;
  userId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadStatus: AttachmentUploadStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskPayload = {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  iconKey: import("@/lib/daily-planner/appearance").TaskIconKey;
  colorKey: import("@/lib/daily-planner/appearance").TaskColorKey;
  completedAt: string | null;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  attachments: TaskAttachmentPayload[];
};

export type PlannerEntryPayload = {
  id: string;
  taskId: string;
  userId: string;
  plannerDate: string;
  position: number;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  closedAt: string | null;
  closureReason: PlannerEntryClosureReason | null;
  movedFromEntryId: string | null;
  movedToEntryId: string | null;
  movedToPlannerDate: string | null;
  createdAt: string;
  updatedAt: string;
  task: TaskPayload;
};

export type PlannerResponse = {
  entries: PlannerEntryPayload[];
  inbox: TaskPayload[];
};

export type BareBuildNotePayload = {
  id: string;
  userId: string;
  pageKey: string;
  body: string;
  priority: BuildNotePriority;
  status: BuildNoteStatus;
  position: number;
  lastDispatchId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BuildNotePayload = BareBuildNotePayload & {
  /** The session the note was last dispatched to, resolved from its dispatch. */
  dispatchSessionUrl: string | null;
};

export type BuildNoteDispatchPayload = {
  id: string;
  pageKey: string;
  sessionId: string;
  sessionUrl: string;
  noteCount: number;
  createdAt: string;
};

export type BuildNotesResponse = {
  /** False when the server has no routine credentials, which disables dispatch. */
  dispatchConfigured: boolean;
  notes: BuildNotePayload[];
};

export type BuildNoteResponse = {
  note: BareBuildNotePayload;
};

export type DispatchBuildNotesResponse = {
  dispatch: BuildNoteDispatchPayload;
  notes: BuildNotePayload[];
};

export type CreateBuildNoteBody = {
  pageKey: string;
  body: string;
  priority: BuildNotePriority;
};

export type UpdateBuildNoteBody = {
  body?: string;
  priority?: BuildNotePriority;
  status?: Exclude<BuildNoteStatus, "dispatched">;
};

export type DispatchBuildNotesBody = {
  pageKey: string;
  noteIds: string[];
};

export type BareTaskPayload = Omit<TaskPayload, "attachments">;

export type BarePlannerEntryPayload = Omit<
  PlannerEntryPayload,
  "task" | "movedToEntryId" | "movedToPlannerDate"
>;

export type TaskMutationResponse = {
  task: BareTaskPayload;
  entry: BarePlannerEntryPayload | null;
};

export type CreateTaskBody = {
  title: string;
  notes?: string | null;
  iconKey?: import("@/lib/daily-planner/appearance").TaskIconKey;
  colorKey?: import("@/lib/daily-planner/appearance").TaskColorKey;
  plannerDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type UpdateTaskBody = {
  title?: string;
  notes?: string | null;
  iconKey?: import("@/lib/daily-planner/appearance").TaskIconKey;
  colorKey?: import("@/lib/daily-planner/appearance").TaskColorKey;
  expectedVersion: number;
};

export type ScheduleTaskBody = {
  plannerDate: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  position?: number;
  expectedVersion: number;
};

export type ReorderPlannerBody = {
  plannerDate: string;
  orderedEntryIds: string[];
};

export type MetricPeriod = "day" | "week" | "month";

export type MetricLinkState = "included" | "excluded";

export type MetricHistoryBucket = {
  periodStart: string;
  periodEnd: string;
  count: number;
};

export type MetricDayHit = {
  date: string;
  hit: boolean;
};

export type MetricPayload = {
  id: string;
  userId: string;
  name: string;
  keywords: string[];
  targetCount: number;
  period: MetricPeriod;
  endsOn: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  periodStart: string;
  periodEnd: string;
  currentCount: number;
  history: MetricHistoryBucket[];
  days: MetricDayHit[];
};

export type MetricsResponse = {
  anchor: string;
  metrics: MetricPayload[];
};

export type BareMetricPayload = {
  id: string;
  userId: string;
  name: string;
  keywords: string[];
  targetCount: number;
  period: MetricPeriod;
  endsOn: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateMetricBody = {
  name: string;
  keywords: string[];
  targetCount: number;
  period: MetricPeriod;
  endsOn?: string | null;
};

export type UpdateMetricBody = {
  name?: string;
  keywords?: string[];
  targetCount?: number;
  period?: MetricPeriod;
  endsOn?: string | null;
};

export type SetMetricLinkBody = {
  metricId: string;
  state: MetricLinkState | "clear";
};

export type TaskMetricLinkPayload = {
  taskId: string;
  metricId: string;
  userId: string;
  state: MetricLinkState;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatus =
  | "applied"
  | "oa_received"
  | "oa_completed"
  | "interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "ghosted";

export type SheetSyncStatus = "pending" | "synced" | "failed";

export type ApplicationPayload = {
  id: string;
  userId: string;
  cycle: string;
  applicationNumber: number;
  company: string;
  title: string;
  status: ApplicationStatus;
  notes: string | null;
  appliedOn: string;
  sheetSyncStatus: SheetSyncStatus;
  sheetSyncedAt: string | null;
  sheetSyncError: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationsResponse = {
  cycle: string;
  applications: ApplicationPayload[];
};

export type ApplicationMutationResponse = {
  application: ApplicationPayload;
};

export type CreateApplicationBody = {
  cycle?: string;
  company: string;
  title: string;
  status?: ApplicationStatus;
  notes?: string | null;
  appliedOn: string;
};

export type UpdateApplicationBody = {
  company?: string;
  title?: string;
  status?: ApplicationStatus;
  notes?: string | null;
  appliedOn?: string;
  expectedVersion: number;
};

export type GoogleConnectionPayload = {
  connected: boolean;
  googleEmail: string | null;
  spreadsheetId: string | null;
  lastImportedAt: string | null;
};

export type GoogleConnectionResponse = {
  connection: GoogleConnectionPayload;
};

export type ImportApplicationsResponse = {
  cycle: string;
  imported: number;
  /** Sheet rows that were missing a number and had one filled in. */
  repaired: number;
};

export type SpreadsheetTabsResponse = {
  tabs: string[];
};

export type ReadingItemKind = "book" | "article";

export type ReadingItemPayload = {
  id: string;
  userId: string;
  kind: ReadingItemKind;
  title: string;
  author: string | null;
  source: string | null;
  url: string | null;
  pdfUrl: string | null;
  imageUrl: string | null;
  coverOptions: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ReadingResponse = {
  items: ReadingItemPayload[];
};

export type ReadingItemResponse = {
  item: ReadingItemPayload;
};

export type CreateReadingItemResponse = ReadingItemResponse & {
  /** The link was already saved; the existing entry came back instead. */
  duplicate: boolean;
};

export type CreateReadingItemBody = {
  input: string;
};

export type UpdateReadingItemBody = {
  title?: string;
  author?: string | null;
  imageUrl?: string | null;
  pdfUrl?: string | null;
  expectedVersion: number;
};
