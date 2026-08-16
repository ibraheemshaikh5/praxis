"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";

import { CompanyLogo } from "@/components/applications/company-logo";
import { ContactDetails } from "@/components/rolodex/contact-details";
import { MeetingLog } from "@/components/rolodex/meeting-log";
import { Portrait } from "@/components/rolodex/portrait";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useConnection,
  useDeleteConnection,
  useUpdateConnection,
} from "@/hooks/use-rolodex";
import { useToday } from "@/hooks/use-today";
import { signOut } from "@/lib/auth/actions";
import type { ConnectionDetailPayload } from "@/lib/api/types";
import { metLabel } from "@/lib/rolodex/dates";

export function ConnectionDetail({
  initialConnection,
  userEmail,
}: {
  initialConnection: ConnectionDetailPayload;
  userEmail: string | null;
}) {
  const router = useRouter();
  const { data } = useConnection(initialConnection.id, initialConnection);
  const connection = data.connection;
  const today = useToday();

  const updateConnection = useUpdateConnection();
  const deleteConnection = useDeleteConnection();
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);

  const lastMet = connection.meetings[0] ?? null;

  return (
    <AppShell
      onSignOut={() => void signOut()}
      title="Rolodex"
      userEmail={userEmail}
    >
      <div className="py-8 lg:py-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1 rounded-4xl text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            href="/rolodex"
          >
            <ChevronLeft className="size-4" />
            Rolodex
          </Link>

          <Button
            onClick={() => setConfirmingRemoval(true)}
            size="sm"
            variant="ghost"
          >
            Remove
          </Button>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-muted text-xl shadow-sm ring-1 ring-foreground/10 sm:size-28">
            <Portrait avatarUrl={connection.avatarUrl} name={connection.name} />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {connection.name}
            </h1>

            {connection.headline ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {connection.headline}
              </p>
            ) : null}

            <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {connection.role ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Role</dt>
                  <dd>{connection.role}</dd>
                </div>
              ) : null}
              {connection.company ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Company</dt>
                  <dd className="flex items-center gap-1.5">
                    <CompanyLogo company={connection.company} />
                    {connection.company}
                  </dd>
                </div>
              ) : null}
              {connection.location ? (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Location</dt>
                  <dd>{connection.location}</dd>
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <dt>Last met</dt>
                <dd className="font-medium text-foreground">
                  {lastMet ? metLabel(lastMet.metOn, today) : "Never"}
                </dd>
              </div>
            </dl>

            <div className="mt-5">
              <ContactDetails
                connection={connection}
                // The card updates optimistically, so the form closes at once
                // and a rejected write rolls back with a toast.
                onSave={(fields, done) => {
                  updateConnection.mutate({
                    connectionId: connection.id,
                    body: { ...fields, expectedVersion: connection.version },
                  });
                  done();
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <GeneralNotes
            connection={connection}
            onSave={(notes) =>
              updateConnection.mutate({
                connectionId: connection.id,
                body: { notes, expectedVersion: connection.version },
              })
            }
          />

          <MeetingLog
            connectionId={connection.id}
            meetings={connection.meetings}
            today={today}
          />
        </div>
      </div>

      <Dialog onOpenChange={setConfirmingRemoval} open={confirmingRemoval}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {connection.name}?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmingRemoval(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteConnection.isPending}
              onClick={() =>
                deleteConnection.mutate(connection.id, {
                  onSuccess: () => {
                    setConfirmingRemoval(false);
                    router.push("/rolodex");
                  },
                })
              }
              variant="destructive"
            >
              {deleteConnection.isPending ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function GeneralNotes({
  connection,
  onSave,
}: {
  connection: ConnectionDetailPayload;
  onSave: (notes: string | null) => void;
}) {
  const saved = connection.notes ?? "";

  // A refetch replaces what is in the box only when nothing was being typed;
  // an edit in progress survives it.
  const [draft, setDraft] = React.useState({ base: saved, value: saved });
  if (draft.base !== saved) {
    setDraft({
      base: saved,
      value: draft.value === draft.base ? saved : draft.value,
    });
  }

  const value = draft.value;
  const setValue = (next: string) => setDraft({ base: saved, value: next });
  const dirty = value !== saved;

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
        Notes
      </h2>

      <Textarea
        aria-label="Notes"
        className="min-h-56 resize-y bg-card"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />

      <div className="mt-2 flex items-center gap-2">
        <Button
          disabled={!dirty}
          onClick={() => onSave(value.trim() || null)}
          size="sm"
        >
          Save
        </Button>
        {dirty ? (
          <Button onClick={() => setValue(saved)} size="sm" variant="ghost">
            Discard
          </Button>
        ) : null}
      </div>
    </section>
  );
}
