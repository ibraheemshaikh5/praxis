import type {
  ApplicationMutationResponse,
  ApplicationsResponse,
  BareMetricPayload,
  BareTaskPayload,
  CreateApplicationBody,
  CreateMetricBody,
  CreateTaskBody,
  GoogleConnectionResponse,
  ImportApplicationsResponse,
  MetricsResponse,
  PlannerResponse,
  ReorderPlannerBody,
  ScheduleTaskBody,
  SetMetricLinkBody,
  SpreadsheetTabsResponse,
  TaskMetricLinkPayload,
  TaskMutationResponse,
  UpdateApplicationBody,
  UpdateMetricBody,
  UpdateTaskBody,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
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
