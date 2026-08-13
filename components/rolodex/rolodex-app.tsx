"use client";

import { AddConnectionBar } from "@/components/rolodex/add-connection-bar";
import { ConnectionCard } from "@/components/rolodex/connection-card";
import { AppShell } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnections, useCreateConnection } from "@/hooks/use-rolodex";
import { useToday } from "@/hooks/use-today";
import { signOut } from "@/lib/auth/actions";

export function RolodexApp({ userEmail }: { userEmail: string | null }) {
  const { data, isError, isLoading } = useConnections();
  const createConnection = useCreateConnection();
  const today = useToday();

  const connections = data?.connections ?? [];

  return (
    <AppShell
      onSignOut={() => void signOut()}
      title="Rolodex"
      userEmail={userEmail}
    >
      <div className="py-8 lg:py-10">
        <header className="mb-10 flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Rolodex</h1>
          <AddConnectionBar
            onSubmit={(input, done) =>
              createConnection.mutate({ input }, { onSuccess: done })
            }
            pending={createConnection.isPending}
          />
        </header>

        {isLoading ? (
          <div
            aria-label="Loading rolodex"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="status"
          >
            {[0, 1, 2, 3].map((index) => (
              <Skeleton className="h-32 rounded-2xl" key={index} />
            ))}
            <span className="sr-only">Loading rolodex</span>
          </div>
        ) : null}

        {!isLoading && isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load your rolodex. Try again shortly.
          </p>
        ) : null}

        {!isLoading && !isError && connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one saved yet.</p>
        ) : null}

        {connections.length > 0 ? (
          <div className="grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {connections.map((connection) => (
              <ConnectionCard
                connection={connection}
                key={connection.id}
                today={today}
              />
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
