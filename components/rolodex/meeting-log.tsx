"use client";

import * as React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddMeeting,
  useDeleteMeeting,
  useUpdateMeeting,
} from "@/hooks/use-rolodex";
import type { ConnectionMeetingPayload } from "@/lib/api/types";
import { formatCalendarDate, metLabel } from "@/lib/rolodex/dates";

export function MeetingLog({
  connectionId,
  meetings,
  today,
}: {
  connectionId: string;
  meetings: ConnectionMeetingPayload[];
  today: string | null;
}) {
  const addMeeting = useAddMeeting(connectionId);
  const updateMeeting = useUpdateMeeting(connectionId);
  const deleteMeeting = useDeleteMeeting(connectionId);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [removing, setRemoving] =
    React.useState<ConnectionMeetingPayload | null>(null);

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
        Meetings
      </h2>

      <MeetingForm
        // `done` clears the form, so a logged meeting leaves it empty and back
        // on today's date.
        onSubmit={(body, done) => addMeeting.mutate(body, { onSuccess: done })}
        pending={addMeeting.isPending}
        today={today}
      />

      {meetings.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing logged.</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {meetings.map((meeting) => (
            <li
              className="border-l-2 border-border pl-4 transition-colors hover:border-primary/40 motion-reduce:transition-none"
              key={meeting.id}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">
                  {formatCalendarDate(meeting.metOn)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {metLabel(meeting.metOn, today)}
                  </span>
                </p>

                <div className="flex shrink-0 items-center">
                  <Button
                    aria-label={`Edit ${formatCalendarDate(meeting.metOn)}`}
                    onClick={() =>
                      setEditingId((current) =>
                        current === meeting.id ? null : meeting.id,
                      )
                    }
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    aria-label={`Remove ${formatCalendarDate(meeting.metOn)}`}
                    onClick={() => setRemoving(meeting)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              {editingId === meeting.id ? (
                <div className="mt-3">
                  <MeetingForm
                    initialNotes={meeting.notes ?? ""}
                    initialMetOn={meeting.metOn}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(body) =>
                      updateMeeting.mutate(
                        { meetingId: meeting.id, body },
                        { onSuccess: () => setEditingId(null) },
                      )
                    }
                    pending={updateMeeting.isPending}
                    today={today}
                  />
                </div>
              ) : meeting.notes ? (
                <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                  {meeting.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <Dialog
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        open={removing !== null}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Remove {removing ? formatCalendarDate(removing.metOn) : ""}?
            </DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setRemoving(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleteMeeting.isPending}
              onClick={() => {
                if (!removing) return;
                deleteMeeting.mutate(removing.id, {
                  onSuccess: () => setRemoving(null),
                });
              }}
              variant="destructive"
            >
              {deleteMeeting.isPending ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MeetingForm({
  initialMetOn,
  initialNotes = "",
  onCancel,
  onSubmit,
  pending,
  today,
}: {
  initialMetOn?: string;
  initialNotes?: string;
  onCancel?: () => void;
  onSubmit: (
    body: { metOn: string; notes: string | null },
    done: () => void,
  ) => void;
  pending: boolean;
  today: string | null;
}) {
  const [metOn, setMetOn] = React.useState(initialMetOn ?? "");
  const [notes, setNotes] = React.useState(initialNotes);

  // A new entry defaults to today, which only the browser knows.
  const value = metOn || today || "";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value || pending) return;

    onSubmit({ metOn: value, notes: notes.trim() || null }, () => {
      setMetOn("");
      setNotes("");
    });
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <Textarea
        aria-label="What happened"
        className="min-h-20 resize-y bg-card"
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes"
        value={notes}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Date met"
          className="h-9 w-40 font-mono text-xs tabular-nums"
          onChange={(event) => setMetOn(event.target.value)}
          type="date"
          value={value}
        />
        <Button disabled={pending || !value} size="sm" type="submit">
          {pending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" />
          ) : null}
          Save
        </Button>
        {onCancel ? (
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
