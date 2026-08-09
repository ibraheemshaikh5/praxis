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
import type { UpdateBuildNoteBody } from "@/lib/api/types";
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
    onError: (error) => reportError(error, "Could not add that task."),
    onSuccess: () => invalidate(client),
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
    onError: (error) => reportError(error, "Could not update that task."),
    onSuccess: () => invalidate(client),
  });
}

export function useDeleteBuildNote() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => deleteBuildNote(noteId),
    onError: (error) => reportError(error, "Could not delete that task."),
    onSuccess: () => invalidate(client),
  });
}

export function useDispatchBuildNotes(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (noteIds: string[]) => dispatchBuildNotes({ pageKey, noteIds }),
    onError: (error) => reportError(error, "Could not start the agent."),
    onSuccess: (response) => {
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
