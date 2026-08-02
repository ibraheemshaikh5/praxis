"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ApplicationFormDialog,
  type ApplicationFormValues,
} from "@/components/applications/application-form-dialog";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { CycleSummary } from "@/components/applications/cycle-summary";
import { GoogleConnectionCard } from "@/components/applications/google-connection-card";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplications,
  useCreateApplication,
  useDisconnectGoogle,
  useGoogleConnection,
  useImportApplications,
  useSyncApplication,
  useUpdateApplication,
} from "@/hooks/use-applications";
import { signOut } from "@/lib/auth/actions";
import type { ApplicationPayload, ApplicationStatus } from "@/lib/api/types";
import { getPlannerTodayKey } from "@/lib/planner/dates";

const CONNECT_MESSAGES: Record<
  string,
  { message: string; tone: "error" | "success" }
> = {
  connected: { message: "Google Sheets connected.", tone: "success" },
  denied: { message: "Google access was declined.", tone: "error" },
  invalid_state: {
    message: "That sign-in link expired. Try connecting again.",
    tone: "error",
  },
};

function TableSkeleton() {
  return (
    <div
      aria-label="Loading applications"
      className="space-y-2.5"
      role="status"
    >
      {[0, 1, 2, 3].map((index) => (
        <Skeleton className="h-12 w-full rounded-2xl" key={index} />
      ))}
      <span className="sr-only">Loading applications</span>
    </div>
  );
}

export function ApplicationsApp({
  cycle,
  timeZone,
  userEmail,
}: {
  cycle: string;
  timeZone: string;
  userEmail: string | null;
}) {
  const todayKey = React.useMemo(
    () => getPlannerTodayKey(timeZone),
    [timeZone],
  );

  const { data, isError, isLoading } = useApplications(cycle);
  const connectionQuery = useGoogleConnection();
  const createApplication = useCreateApplication();
  const updateApplication = useUpdateApplication(cycle);
  const syncApplication = useSyncApplication();
  const importApplications = useImportApplications();
  const disconnectGoogle = useDisconnectGoogle();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ApplicationPayload | null>(null);

  const applications = React.useMemo(
    () => data?.applications ?? [],
    [data?.applications],
  );
  const connection = connectionQuery.data?.connection;
  const needsImport = Boolean(
    connection?.connected && !connection.lastImportedAt,
  );

  // The OAuth callback lands here with a result flag; report it once and drop
  // it from the address bar so a refresh does not repeat the toast.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("google");
    const copy = result ? CONNECT_MESSAGES[result] : undefined;
    if (!result) return;

    if (copy) {
      if (copy.tone === "success") toast.success(copy.message);
      else toast.error(copy.message);
    }

    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const companySuggestions = React.useMemo(
    () => [...new Set(applications.map((item) => item.company))].sort(),
    [applications],
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(application: ApplicationPayload) {
    setEditing(application);
    setDialogOpen(true);
  }

  async function handleSubmit(values: ApplicationFormValues) {
    if (editing) {
      await updateApplication.mutateAsync({
        applicationId: editing.id,
        body: { ...values, expectedVersion: editing.version },
      });
    } else {
      await createApplication.mutateAsync({ ...values, cycle });
    }

    setDialogOpen(false);
    setEditing(null);
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

  const formPending =
    createApplication.isPending || updateApplication.isPending;

  return (
    <AppShell
      headerAction={
        <Button onClick={openCreate} size="sm">
          <Plus data-icon="inline-start" />
          Log application
        </Button>
      }
      onSignOut={() => void signOut()}
      rail={
        <div className="flex flex-col gap-4">
          <CycleSummary
            applications={applications}
            cycle={cycle}
            isLoading={isLoading}
          />
          <GoogleConnectionCard
            connection={connection}
            cycle={cycle}
            importing={importApplications.isPending}
            isLoading={connectionQuery.isLoading}
            onDisconnect={() => disconnectGoogle.mutate()}
            onImport={() => importApplications.mutate(cycle)}
          />
        </div>
      }
      title="Applications"
      userEmail={userEmail}
    >
      <div className="py-8 lg:py-10">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {cycle} applications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One row per application, numbered in the order you sent them.
          </p>
        </header>

        {isLoading ? <TableSkeleton /> : null}

        {!isLoading && isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load applications. Try again shortly.
          </p>
        ) : null}

        {!isLoading && !isError && applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing logged for {cycle} yet.
            </p>
            <Button className="mt-3" onClick={openCreate} size="sm">
              Log your first application
            </Button>
          </div>
        ) : null}

        {!isLoading && applications.length > 0 ? (
          <ApplicationsTable
            applications={applications}
            onEdit={openEdit}
            onRetrySync={(applicationId) =>
              syncApplication.mutate(applicationId)
            }
            onStatusChange={handleStatusChange}
          />
        ) : null}
      </div>

      <ApplicationFormDialog
        application={editing}
        companySuggestions={companySuggestions}
        cycle={cycle}
        needsImport={needsImport}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={handleSubmit}
        open={dialogOpen}
        pending={formPending}
        todayKey={todayKey}
      />
    </AppShell>
  );
}
