"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  ApplicationsTable,
  type RowDraft,
} from "@/components/applications/applications-table";
import { CycleSummary } from "@/components/applications/cycle-summary";
import { SheetToolbar } from "@/components/applications/sheet-toolbar";
import { AppShell } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplications,
  useAutoImportApplications,
  useCreateApplication,
  useDisconnectGoogle,
  useGoogleConnection,
  useImportApplications,
  useSpreadsheetTabs,
  useSyncApplication,
  useUpdateApplication,
} from "@/hooks/use-applications";
import { signOut } from "@/lib/auth/actions";
import type { ApplicationPayload, ApplicationStatus } from "@/lib/api/types";
import { getPlannerTodayKey } from "@/lib/planner/dates";

const CONNECT_MESSAGES: Record<string, { message: string; ok: boolean }> = {
  connected: { message: "Google Sheets connected.", ok: true },
  denied: { message: "Google access was declined.", ok: false },
  invalid_state: {
    message: "That sign-in link expired. Try connecting again.",
    ok: false,
  },
};

const CYCLE_STORAGE_KEY = "praxis:applications:cycle";

function emptyDraft(todayKey: string): RowDraft {
  return {
    company: "",
    title: "",
    status: "applied",
    notes: "",
    appliedOn: todayKey,
  };
}

function draftFrom(application: ApplicationPayload): RowDraft {
  return {
    company: application.company,
    title: application.title,
    status: application.status,
    notes: application.notes ?? "",
    appliedOn: application.appliedOn,
  };
}

function changed(draft: RowDraft, application: ApplicationPayload) {
  return (
    draft.company.trim() !== application.company ||
    draft.title.trim() !== application.title ||
    draft.status !== application.status ||
    (draft.notes.trim() || null) !== application.notes ||
    draft.appliedOn !== application.appliedOn
  );
}

export function ApplicationsApp({
  defaultCycle,
  timeZone,
  userEmail,
}: {
  defaultCycle: string;
  timeZone: string;
  userEmail: string | null;
}) {
  const todayKey = React.useMemo(
    () => getPlannerTodayKey(timeZone),
    [timeZone],
  );

  const [cycle, setCycle] = React.useState(defaultCycle);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<RowDraft | null>(null);
  const [newDraft, setNewDraft] = React.useState<RowDraft>(() =>
    emptyDraft(todayKey),
  );

  const { data, isError, isLoading } = useApplications(cycle);
  const connectionQuery = useGoogleConnection();
  const connection = connectionQuery.data?.connection;
  const tabsQuery = useSpreadsheetTabs(Boolean(connection?.connected));

  const createApplication = useCreateApplication();
  const updateApplication = useUpdateApplication(cycle);
  const syncApplication = useSyncApplication();
  const importApplications = useImportApplications();
  const disconnectGoogle = useDisconnectGoogle();

  useAutoImportApplications(cycle, Boolean(connection?.connected));

  const applications = React.useMemo(
    () => data?.applications ?? [],
    [data?.applications],
  );

  const nextNumber = React.useMemo(
    () =>
      applications.reduce(
        (highest, item) => Math.max(highest, item.applicationNumber),
        0,
      ) + 1,
    [applications],
  );

  // Remember the tab across visits; the cycle is a working context, not a route.
  // The server cannot know the stored tab, so this can only be applied after
  // mount — initializing from localStorage instead would desync hydration.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(CYCLE_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setCycle(stored);
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem(CYCLE_STORAGE_KEY, cycle);
  }, [cycle]);

  // The OAuth callback lands here with a result flag; report it once and drop
  // it from the address bar so a refresh does not repeat the toast.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("google");
    if (!result) return;

    const copy = CONNECT_MESSAGES[result];
    if (copy?.ok) toast.success(copy.message);
    else if (copy) toast.error(copy.message);

    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.toString());
  }, []);

  function startEdit(application: ApplicationPayload) {
    setEditingId(application.id);
    setDraft(draftFrom(application));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function commitEdit() {
    const application = applications.find((item) => item.id === editingId);
    if (!application || !draft) return cancelEdit();

    if (!draft.company.trim() || !draft.title.trim()) {
      toast.error("Company and title cannot be empty.");
      return;
    }

    if (changed(draft, application)) {
      updateApplication.mutate({
        applicationId: application.id,
        body: {
          company: draft.company.trim(),
          title: draft.title.trim(),
          status: draft.status,
          notes: draft.notes.trim() || null,
          appliedOn: draft.appliedOn,
          expectedVersion: application.version,
        },
      });
    }

    cancelEdit();
  }

  function commitNew() {
    if (createApplication.isPending) return;
    if (!newDraft.company.trim() || !newDraft.title.trim()) return;

    createApplication.mutate(
      {
        cycle,
        company: newDraft.company.trim(),
        title: newDraft.title.trim(),
        status: newDraft.status,
        notes: newDraft.notes.trim() || null,
        appliedOn: newDraft.appliedOn,
      },
      { onSuccess: () => setNewDraft(emptyDraft(todayKey)) },
    );
  }

  function handleStatusChange(
    application: ApplicationPayload,
    status: ApplicationStatus,
  ) {
    if (status === application.status) return;
    updateApplication.mutate({
      applicationId: application.id,
      body: { status, expectedVersion: application.version },
    });
  }

  return (
    <AppShell onSignOut={signOut} title="Applications" userEmail={userEmail}>
      <div className="py-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{cycle}</h1>
            <SheetToolbar
              connection={connection}
              cycle={cycle}
              disconnecting={disconnectGoogle.isPending}
              importing={importApplications.isPending}
              isLoading={connectionQuery.isLoading}
              onCycleChange={(next) => {
                setCycle(next);
                cancelEdit();
              }}
              onDisconnect={() => disconnectGoogle.mutate()}
              onImport={() => importApplications.mutate(cycle)}
              tabs={tabsQuery.data?.tabs ?? []}
            />
          </div>

          {!isLoading && !isError ? (
            <CycleSummary applications={applications} />
          ) : null}
        </header>

        {isLoading ? (
          <div aria-label="Loading applications" role="status">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton className="mb-2 h-11 w-full rounded-lg" key={index} />
            ))}
            <span className="sr-only">Loading applications</span>
          </div>
        ) : null}

        {!isLoading && isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load applications. Try again shortly.
          </p>
        ) : null}

        {!isLoading && !isError ? (
          <ApplicationsTable
            applications={applications}
            creating={createApplication.isPending}
            draft={draft}
            editingId={editingId}
            newDraft={newDraft}
            nextNumber={nextNumber}
            onCancelEdit={cancelEdit}
            onCommitEdit={commitEdit}
            onCommitNew={commitNew}
            onDraftChange={setDraft}
            onNewDraftChange={setNewDraft}
            onRetrySync={(applicationId) =>
              syncApplication.mutate(applicationId)
            }
            onStartEdit={startEdit}
            onStatusChange={handleStatusChange}
            syncingId={
              syncApplication.isPending
                ? (syncApplication.variables ?? null)
                : null
            }
          />
        ) : null}
      </div>
    </AppShell>
  );
}
