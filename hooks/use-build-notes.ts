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
  fetchBuildNotes,
  updateBuildNote,
} from "@/lib/api/client";
import type { UpdateBuildNoteBody } from "@/lib/api/types";
import type { BuildNotePriority } from "@/lib/build-notes/priority";

export const buildNotesKeys = {
  all: ["build-notes"] as const,
  list: (pageKey: string) => ["build-notes", pageKey] as const,
};

function reportError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

function invalidate(client: QueryClient, pageKey: string) {
  return client.invalidateQueries({ queryKey: buildNotesKeys.list(pageKey) });
}

export function useBuildNotes(pageKey: string) {
  return useQuery({
    queryKey: buildNotesKeys.list(pageKey),
    queryFn: () => fetchBuildNotes(pageKey),
    enabled: Boolean(pageKey),
  });
}

export function useCreateBuildNote(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { body: string; priority: BuildNotePriority }) =>
      createBuildNote({ pageKey, ...input }),
    onError: (error) => reportError(error, "Could not add that note."),
    onSuccess: () => invalidate(client, pageKey),
  });
}

export function useUpdateBuildNote(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      noteId,
      ...body
    }: UpdateBuildNoteBody & { noteId: string }) =>
      updateBuildNote(noteId, body),
    onError: (error) => reportError(error, "Could not update that note."),
    onSuccess: () => invalidate(client, pageKey),
  });
}

export function useDeleteBuildNote(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => deleteBuildNote(noteId),
    onError: (error) => reportError(error, "Could not delete that note."),
    onSuccess: () => invalidate(client, pageKey),
  });
}

export function useDispatchBuildNotes(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (noteIds: string[]) => dispatchBuildNotes({ pageKey, noteIds }),
    onError: (error) => reportError(error, "Could not start the agent."),
    onSuccess: (response) => {
      void invalidate(client, pageKey);
      toast.success("Agent started", {
        action: {
          label: "Open session",
          onClick: () => window.open(response.dispatch.sessionUrl, "_blank"),
        },
      });
    },
  });
}
