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
  createBuildNote,
  deleteBuildNote,
  dispatchBuildNotes,
  fetchBuildNoteDispatches,
  fetchBuildNotes,
  updateBuildNote,
} from "@/lib/api/client";
import { applyOptimistically } from "@/lib/api/optimistic";
import type {
  BareBuildNotePayload,
  BuildNoteDispatchesResponse,
  BuildNotePayload,
  BuildNotesResponse,
  UpdateBuildNoteBody,
} from "@/lib/api/types";
import type { BuildNotePriority } from "@/lib/build-notes/priority";

export const buildNotesKeys = {
  all: ["build-notes"] as const,
  list: (pageKey: string) => ["build-notes", pageKey] as const,
  dispatches: ["build-notes", "dispatches"] as const,
};

function reportError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

// A note edited from the cloud tab may belong to any page, and every edit moves
// a dispatch's progress, so mutations invalidate the whole key space.
function invalidate(client: QueryClient) {
  return client.invalidateQueries({ queryKey: buildNotesKeys.all });
}

/** The server's list order, mirrored so optimistic rows land where the refetch
 * will put them. */
function sortNotes<T extends BareBuildNotePayload>(notes: T[]): T[] {
  return [...notes].sort((a, b) =>
    a.priority === b.priority
      ? a.position - b.position
      : a.priority < b.priority
        ? -1
        : 1,
  );
}

/** Applies an edit to a note wherever it is cached: the per-page lists and the
 * dispatch groups both carry copies of the same rows. */
function editNoteEverywhere(
  client: QueryClient,
  noteId: string,
  edit: (note: BareBuildNotePayload) => BareBuildNotePayload | null,
) {
  client.setQueriesData<BuildNotesResponse>(
    {
      queryKey: buildNotesKeys.all,
      predicate: (query) => query.queryKey[1] !== "dispatches",
    },
    (current) =>
      current
        ? {
            ...current,
            notes: sortNotes(
              current.notes.flatMap((note) => {
                if (note.id !== noteId) return [note];
                const next = edit(note);
                return next ? [{ ...note, ...next }] : [];
              }),
            ),
          }
        : current,
  );

  client.setQueryData<BuildNoteDispatchesResponse>(
    buildNotesKeys.dispatches,
    (current) =>
      current
        ? {
            dispatches: current.dispatches.map((dispatch) => ({
              ...dispatch,
              notes: dispatch.notes.flatMap((note) => {
                if (note.id !== noteId) return [note];
                const next = edit(note);
                return next ? [next] : [];
              }),
            })),
          }
        : current,
  );
}

export function useBuildNotes(pageKey: string) {
  return useQuery({
    queryKey: buildNotesKeys.list(pageKey),
    queryFn: () => fetchBuildNotes(pageKey),
    enabled: Boolean(pageKey),
  });
}

export function useBuildNoteDispatches() {
  return useQuery({
    queryKey: buildNotesKeys.dispatches,
    queryFn: fetchBuildNoteDispatches,
  });
}

export function useCreateBuildNote(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { body: string; priority: BuildNotePriority }) =>
      createBuildNote({ pageKey, ...input }),
    async onMutate(input) {
      const queryKey = buildNotesKeys.list(pageKey);
      const rollback = await applyOptimistically(client, [queryKey], () => {
        client.setQueryData<BuildNotesResponse>(queryKey, (current) => {
          if (!current) return current;
          const now = new Date().toISOString();
          const note: BuildNotePayload = {
            // A provisional row; the refetch replaces it with the stored one.
            id: crypto.randomUUID(),
            userId: "",
            pageKey,
            body: input.body,
            priority: input.priority,
            status: "open",
            position:
              Math.max(0, ...current.notes.map((note) => note.position)) + 1024,
            lastDispatchId: null,
            dispatchSessionUrl: null,
            createdAt: now,
            updatedAt: now,
          };
          return { ...current, notes: sortNotes([...current.notes, note]) };
        });
      });
      return { rollback };
    },
    onError(error, _input, context) {
      context?.rollback();
      reportError(error, "Could not add that task.");
    },
    onSettled: () => invalidate(client),
  });
}

export function useUpdateBuildNote() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      noteId,
      ...body
    }: UpdateBuildNoteBody & { noteId: string }) =>
      updateBuildNote(noteId, body),
    async onMutate({ noteId, ...body }) {
      const rollback = await applyOptimistically(
        client,
        [buildNotesKeys.all],
        () =>
          editNoteEverywhere(client, noteId, (note) => ({
            ...note,
            ...body,
            updatedAt: new Date().toISOString(),
          })),
      );
      return { rollback };
    },
    onError(error, _input, context) {
      context?.rollback();
      reportError(error, "Could not update that task.");
    },
    onSettled: () => invalidate(client),
  });
}

export function useDeleteBuildNote() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => deleteBuildNote(noteId),
    async onMutate(noteId) {
      const rollback = await applyOptimistically(
        client,
        [buildNotesKeys.all],
        () => editNoteEverywhere(client, noteId, () => null),
      );
      return { rollback };
    },
    onError(error, _input, context) {
      context?.rollback();
      reportError(error, "Could not delete that task.");
    },
    onSettled: () => invalidate(client),
  });
}

export function useDispatchBuildNotes(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    // Dispatch creates a session on a remote service, so it stays a pending
    // state rather than an optimistic one: there is nothing honest to render
    // until the server answers.
    mutationFn: (noteIds: string[]) => dispatchBuildNotes({ pageKey, noteIds }),
    onError: (error) => reportError(error, "Could not start the agent."),
    onSuccess: (response) => {
      // The response carries the authoritative rows; write them through so the
      // tasks leave this page's list and the run is already in the cloud tab
      // when the panel switches to it, ahead of the refetch.
      const dispatched = new Map(response.notes.map((note) => [note.id, note]));
      client.setQueryData<BuildNotesResponse>(
        buildNotesKeys.list(pageKey),
        (current) =>
          current
            ? {
                ...current,
                notes: current.notes.map(
                  (note) => dispatched.get(note.id) ?? note,
                ),
              }
            : current,
      );
      client.setQueryData<BuildNoteDispatchesResponse>(
        buildNotesKeys.dispatches,
        (current) =>
          current
            ? {
                dispatches: [
                  { ...response.dispatch, notes: response.notes },
                  ...current.dispatches,
                ],
              }
            : current,
      );

      void invalidate(client);
      toast.success("Agent started", {
        action: {
          label: "Open session",
          onClick: () => window.open(response.dispatch.sessionUrl, "_blank"),
        },
      });
    },
  });
}
