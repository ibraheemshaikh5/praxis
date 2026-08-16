import type {
  ApplicationMutationResponse,
  ApplicationsResponse,
  AttachmentMutationResponse,
  BareConnectionPayload,
  BareMetricPayload,
  BareTaskPayload,
  BookSearchResponse,
  BuildNoteDispatchesResponse,
  BuildNoteResponse,
  BuildNotesResponse,
  ConnectionMeetingResponse,
  ConnectionResponse,
  CreateApplicationBody,
  CreateBuildNoteBody,
  CreateConnectionBody,
  CreateConnectionMeetingBody,
  CreateConnectionResponse,
  CreateMetricBody,
  CreateReadingItemBody,
  CreateReadingItemResponse,
  CreateTaskBody,
  CreateWhiteboardBody,
  DispatchBuildNotesBody,
  DispatchBuildNotesResponse,
  GoogleConnectionResponse,
  ImportApplicationsResponse,
  MetricsResponse,
  PlannerResponse,
  ReadingItemResponse,
  ReadingResponse,
  ReorderPlannerBody,
  ReserveAttachmentBody,
  ReserveAttachmentResponse,
  RetryAttachmentResponse,
  RolodexResponse,
  ScheduleTaskBody,
  SetMetricLinkBody,
  SpreadsheetTabsResponse,
  TaskMetricLinkPayload,
  TaskMutationResponse,
  UpdateApplicationBody,
  UpdateBuildNoteBody,
  UpdateConnectionBody,
  UpdateConnectionMeetingBody,
  UpdateMetricBody,
  UpdateReadingItemBody,
  UpdateTaskBody,
  UpdateWhiteboardBody,
  WhiteboardResponse,
  WhiteboardsResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The task changed underneath us and the client state is stale. */
  get isVersionConflict() {
    return this.status === 409;
  }

  get isUnauthenticated() {
    return this.status === 401;
  }
}

// Mutations never retry, so without a deadline a stalled connection would
// leave the interface pending forever. Generous enough for the slow calls
// (spreadsheet round-trips, dispatching an agent session).
const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      throw new ApiError(0, "TIMEOUT", "The server took too long to respond.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload.error as { code?: string; message?: string })
        : null;

    // Session expired or signed out: leave the page rather than leave
    // React Query with an unhandled rejection.
    if (response.status === 401 && typeof window !== "undefined") {
      const onLogin =
        window.location.pathname === "/login" ||
        window.location.pathname.startsWith("/login/");
      if (!onLogin) {
        window.location.assign("/login");
      }
    }

    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Something went wrong.",
    );
  }

  return payload as T;
}

export function fetchPlanner(params: {
  from: string;
  to: string;
  inbox?: boolean;
}) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    inbox: params.inbox ? "true" : "false",
  });

  return request<PlannerResponse>(`/api/planner?${query}`);
}

export function fetchBuildNotes(pageKey: string) {
  const query = new URLSearchParams({ key: pageKey });
  return request<BuildNotesResponse>(`/api/build-notes?${query}`);
}

export function fetchBuildNoteDispatches() {
  return request<BuildNoteDispatchesResponse>("/api/build-notes/dispatches");
}

export function createBuildNote(body: CreateBuildNoteBody) {
  return request<BuildNoteResponse>("/api/build-notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateBuildNote(noteId: string, body: UpdateBuildNoteBody) {
  return request<BuildNoteResponse>(`/api/build-notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteBuildNote(noteId: string) {
  return request<BuildNoteResponse>(`/api/build-notes/${noteId}`, {
    method: "DELETE",
  });
}

export function dispatchBuildNotes(body: DispatchBuildNotesBody) {
  return request<DispatchBuildNotesResponse>("/api/build-notes/dispatch", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createTask(body: CreateTaskBody) {
  return request<TaskMutationResponse>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateTask(taskId: string, body: UpdateTaskBody) {
  return request<BareTaskPayload>(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteTask(taskId: string, expectedVersion: number) {
  const query = new URLSearchParams({
    expectedVersion: String(expectedVersion),
  });

  return request<BareTaskPayload>(`/api/tasks/${taskId}?${query}`, {
    method: "DELETE",
  });
}

export function restoreTask(taskId: string, expectedVersion: number) {
  return request<BareTaskPayload>(`/api/tasks/${taskId}/restore`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function setTaskCompletion(
  taskId: string,
  body: { completed: boolean; expectedVersion: number },
) {
  return request<BareTaskPayload>(`/api/tasks/${taskId}/completion`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function scheduleTask(taskId: string, body: ScheduleTaskBody) {
  return request<TaskMutationResponse>(`/api/tasks/${taskId}/schedule`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function attachmentUrl(taskId: string, attachmentId: string) {
  return `/api/tasks/${taskId}/attachments/${attachmentId}`;
}

export function reserveAttachment(
  taskId: string,
  body: ReserveAttachmentBody,
) {
  return request<ReserveAttachmentResponse>(
    `/api/tasks/${taskId}/attachments`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function confirmAttachment(taskId: string, attachmentId: string) {
  return request<AttachmentMutationResponse>(
    `${attachmentUrl(taskId, attachmentId)}/confirm`,
    { method: "POST" },
  );
}

export function retryAttachment(taskId: string, attachmentId: string) {
  return request<RetryAttachmentResponse>(
    `${attachmentUrl(taskId, attachmentId)}/retry`,
    { method: "POST" },
  );
}

export function deleteAttachment(taskId: string, attachmentId: string) {
  return request<AttachmentMutationResponse>(
    attachmentUrl(taskId, attachmentId),
    { method: "DELETE" },
  );
}

export function reorderPlanner(body: ReorderPlannerBody) {
  return request<{ entries: unknown[] }>("/api/planner/reorder", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMetrics(anchor: string) {
  const query = new URLSearchParams({ anchor });
  return request<MetricsResponse>(`/api/metrics?${query}`);
}

export function createMetric(body: CreateMetricBody) {
  return request<{ metric: BareMetricPayload }>("/api/metrics", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateMetric(metricId: string, body: UpdateMetricBody) {
  return request<{ metric: BareMetricPayload }>(`/api/metrics/${metricId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function archiveMetric(metricId: string) {
  return request<{ metric: BareMetricPayload }>(`/api/metrics/${metricId}`, {
    method: "DELETE",
  });
}

export function setMetricLink(taskId: string, body: SetMetricLinkBody) {
  return request<{ link: TaskMetricLinkPayload | null }>(
    `/api/tasks/${taskId}/metric-links`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function fetchApplications(cycle?: string) {
  const query = new URLSearchParams(cycle ? { cycle } : {});
  const suffix = query.size > 0 ? `?${query}` : "";
  return request<ApplicationsResponse>(`/api/applications${suffix}`);
}

export function createApplication(body: CreateApplicationBody) {
  return request<ApplicationMutationResponse>("/api/applications", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateApplication(
  applicationId: string,
  body: UpdateApplicationBody,
) {
  return request<ApplicationMutationResponse>(
    `/api/applications/${applicationId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function syncApplication(applicationId: string) {
  return request<ApplicationMutationResponse>(
    `/api/applications/${applicationId}/sync`,
    { method: "POST" },
  );
}

export function importApplications(cycle?: string) {
  return request<ImportApplicationsResponse>("/api/applications/import", {
    method: "POST",
    body: JSON.stringify(cycle ? { cycle } : {}),
  });
}

export function fetchReadingItems() {
  return request<ReadingResponse>("/api/reading");
}

export function fetchReadingItem(itemId: string) {
  return request<ReadingItemResponse>(`/api/reading/${itemId}`);
}

export function searchBooks(title: string) {
  const query = new URLSearchParams({ title });
  return request<BookSearchResponse>(`/api/reading/search?${query}`);
}

export function createReadingItem(body: CreateReadingItemBody) {
  return request<CreateReadingItemResponse>("/api/reading", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateReadingItem(itemId: string, body: UpdateReadingItemBody) {
  return request<ReadingItemResponse>(`/api/reading/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteReadingItem(itemId: string) {
  return request<ReadingItemResponse>(`/api/reading/${itemId}`, {
    method: "DELETE",
  });
}

export function fetchConnections() {
  return request<RolodexResponse>("/api/rolodex");
}

export function fetchConnection(connectionId: string) {
  return request<ConnectionResponse>(`/api/rolodex/${connectionId}`);
}

export function createConnection(body: CreateConnectionBody) {
  return request<CreateConnectionResponse>("/api/rolodex", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateConnection(
  connectionId: string,
  body: UpdateConnectionBody,
) {
  return request<ConnectionResponse>(`/api/rolodex/${connectionId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteConnection(connectionId: string) {
  return request<{ connection: BareConnectionPayload }>(
    `/api/rolodex/${connectionId}`,
    { method: "DELETE" },
  );
}

export function createConnectionMeeting(
  connectionId: string,
  body: CreateConnectionMeetingBody,
) {
  return request<ConnectionMeetingResponse>(
    `/api/rolodex/${connectionId}/meetings`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateConnectionMeeting(
  connectionId: string,
  meetingId: string,
  body: UpdateConnectionMeetingBody,
) {
  return request<ConnectionMeetingResponse>(
    `/api/rolodex/${connectionId}/meetings/${meetingId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function deleteConnectionMeeting(
  connectionId: string,
  meetingId: string,
) {
  return request<ConnectionMeetingResponse>(
    `/api/rolodex/${connectionId}/meetings/${meetingId}`,
    { method: "DELETE" },
  );
}

export function fetchSpreadsheetTabs() {
  return request<SpreadsheetTabsResponse>("/api/google/sheets");
}

export function fetchGoogleConnection() {
  return request<GoogleConnectionResponse>("/api/google/connection");
}

export function disconnectGoogle() {
  return request<GoogleConnectionResponse>("/api/google/connection", {
    method: "DELETE",
  });
}

export function fetchWhiteboards(pageKey: string) {
  const query = new URLSearchParams({ key: pageKey });
  return request<WhiteboardsResponse>(`/api/whiteboards?${query}`);
}

export function fetchWhiteboard(whiteboardId: string) {
  return request<WhiteboardResponse>(`/api/whiteboards/${whiteboardId}`);
}

export function createWhiteboard(body: CreateWhiteboardBody) {
  return request<WhiteboardResponse>("/api/whiteboards", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateWhiteboard(
  whiteboardId: string,
  body: UpdateWhiteboardBody,
) {
  return request<WhiteboardResponse>(`/api/whiteboards/${whiteboardId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteWhiteboard(whiteboardId: string) {
  return request<{ whiteboard: { id: string } }>(
    `/api/whiteboards/${whiteboardId}`,
    { method: "DELETE" },
  );
}
