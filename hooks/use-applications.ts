"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ApiError,
  createApplication,
  deleteApplication,
  disconnectGoogle,
  fetchApplications,
  fetchGoogleConnection,
  fetchSpreadsheetTabs,
  importApplications,
  syncApplication,
  updateApplication,
} from "@/lib/api/client";
import type {
  ApplicationPayload,
  ApplicationsResponse,
  CreateApplicationBody,
  UpdateApplicationBody,
} from "@/lib/api/types";

export const applicationsKeys = {
  all: ["applications"] as const,
  list: (cycle: string) => ["applications", "list", cycle] as const,
  connection: ["applications", "google-connection"] as const,
  tabs: ["applications", "spreadsheet-tabs"] as const,
};

function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }

  toast.error(fallback);
}

/**
 * The row is already safe in Postgres by the time this runs; a failed push is
 * a warning with a retry, never a lost application.
 */
function reportSyncOutcome(application: ApplicationPayload) {
  if (application.sheetSyncStatus === "failed") {
    toast.warning(
      application.sheetSyncError ??
        "Saved here, but the spreadsheet could not be updated.",
    );
    return;
  }

  if (application.sheetSyncStatus === "pending") {
    toast.success("Saved. Connect Google to mirror it into the sheet.");
    return;
  }

  toast.success(`Saved as #${application.applicationNumber}.`);
}

function invalidateApplications(client: QueryClient) {
  return client.invalidateQueries({ queryKey: applicationsKeys.all });
}

export function useApplications(cycle: string) {
  return useQuery({
    queryKey: applicationsKeys.list(cycle),
    queryFn: () => fetchApplications(cycle),
    staleTime: 15_000,
    enabled: Boolean(cycle),
  });
}

/**
 * Silently re-imports the connected tab so edits made straight in the
 * spreadsheet show up here without a manual "Import" click.
 */
export function useAutoImportApplications(cycle: string, enabled: boolean) {
  const client = useQueryClient();

  useQuery({
    queryKey: [...applicationsKeys.list(cycle), "auto-import"] as const,
    queryFn: async () => {
      const result = await importApplications(cycle);
      if (result.imported > 0) await invalidateApplications(client);
      return result;
    },
    enabled: enabled && Boolean(cycle),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useGoogleConnection() {
  return useQuery({
    queryKey: applicationsKeys.connection,
    queryFn: () => fetchGoogleConnection(),
    staleTime: 60_000,
  });
}

export function useSpreadsheetTabs(enabled: boolean) {
  return useQuery({
    queryKey: applicationsKeys.tabs,
    queryFn: () => fetchSpreadsheetTabs(),
    staleTime: 300_000,
    enabled,
  });
}

export function useCreateApplication() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateApplicationBody) => createApplication(body),
    onSuccess: (result) => reportSyncOutcome(result.application),
    onError: (error) => reportError(error, "Could not log that application."),
    onSettled: () => invalidateApplications(client),
  });
}

export function useUpdateApplication(cycle: string) {
  const client = useQueryClient();
  const queryKey = applicationsKeys.list(cycle);

  return useMutation({
    mutationFn: (input: {
      applicationId: string;
      body: UpdateApplicationBody;
    }) => updateApplication(input.applicationId, input.body),
    // Status changes happen inline in the table, so the badge moves first and
    // rolls back if the write is rejected.
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<ApplicationsResponse>(queryKey);

      if (previous) {
        client.setQueryData<ApplicationsResponse>(queryKey, {
          ...previous,
          applications: previous.applications.map((application) =>
            application.id === input.applicationId
              ? { ...application, ...stripVersion(input.body) }
              : application,
          ),
        });
      }

      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous);
      reportError(error, "Could not update that application.");
    },
    onSuccess: (result) => {
      if (result.application.sheetSyncStatus === "failed") {
        toast.warning(
          result.application.sheetSyncError ??
            "Updated here, but the spreadsheet could not be updated.",
        );
      }
    },
    onSettled: () => invalidateApplications(client),
  });
}

export function useDeleteApplication(cycle: string) {
  const client = useQueryClient();
  const queryKey = applicationsKeys.list(cycle);

  return useMutation({
    mutationFn: (applicationId: string) => deleteApplication(applicationId),
    // The row leaves the table immediately and rolls back if the delete is
    // rejected, the same optimism the status dropdown uses.
    onMutate: async (applicationId) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<ApplicationsResponse>(queryKey);

      if (previous) {
        client.setQueryData<ApplicationsResponse>(queryKey, {
          ...previous,
          applications: previous.applications.filter(
            (application) => application.id !== applicationId,
          ),
        });
      }

      return { previous };
    },
    onError: (error, _applicationId, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous);
      reportError(error, "Could not delete that application.");
    },
    onSuccess: () => toast.success("Application deleted."),
    onSettled: () => invalidateApplications(client),
  });
}

export function useSyncApplication() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (applicationId: string) => syncApplication(applicationId),
    onSuccess: (result) => {
      if (result.application.sheetSyncStatus === "synced") {
        toast.success("Spreadsheet updated.");
        return;
      }
      toast.warning(
        result.application.sheetSyncError ??
          "The spreadsheet is still out of date.",
      );
    },
    onError: (error) => reportError(error, "Could not reach the spreadsheet."),
    onSettled: () => invalidateApplications(client),
  });
}

export function useImportApplications() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (cycle: string) => importApplications(cycle),
    onSuccess: (result) => {
      if (result.imported === 0) {
        toast.success(`No rows found in ${result.cycle}.`);
        return;
      }
      const repaired = result.repaired
        ? ` Numbered ${result.repaired} row${result.repaired === 1 ? "" : "s"} that were missing a #.`
        : "";
      toast.success(
        `Imported ${result.imported} row${result.imported === 1 ? "" : "s"} from ${result.cycle}.${repaired}`,
      );
    },
    onError: (error) => reportError(error, "Could not read the spreadsheet."),
    onSettled: () => invalidateApplications(client),
  });
}

export function useDisconnectGoogle() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => disconnectGoogle(),
    onSuccess: () => toast.success("Google account disconnected."),
    onError: (error) => reportError(error, "Could not disconnect Google."),
    onSettled: () => invalidateApplications(client),
  });
}

/** `expectedVersion` is a write-time guard, not a field the row displays. */
function stripVersion(body: UpdateApplicationBody) {
  const fields: Partial<UpdateApplicationBody> = { ...body };
  delete fields.expectedVersion;
  return fields;
}
