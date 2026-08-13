"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ApiError,
  createWhiteboard,
  deleteWhiteboard,
  fetchWhiteboard,
  fetchWhiteboards,
  updateWhiteboard,
} from "@/lib/api/client";
import type { UpdateWhiteboardBody } from "@/lib/api/types";

export const whiteboardKeys = {
  list: (pageKey: string) => ["whiteboards", "list", pageKey] as const,
  detail: (whiteboardId: string) =>
    ["whiteboards", "detail", whiteboardId] as const,
};

function reportError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

// The board auto-saves while the user draws, so these queries refetch far
// more often than most. The app-wide policy gives up on network errors
// (status 0); here a dropped connection has to survive a retry or the open
// canvas pays for it.
function retryTransientErrors(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status > 0 && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

export function useWhiteboards(pageKey: string, enabled = true) {
  return useQuery({
    queryKey: whiteboardKeys.list(pageKey),
    queryFn: () => fetchWhiteboards(pageKey),
    enabled: enabled && Boolean(pageKey),
    retry: retryTransientErrors,
  });
}

export function useWhiteboard(whiteboardId: string | null) {
  return useQuery({
    queryKey: whiteboardKeys.detail(whiteboardId ?? ""),
    queryFn: () => fetchWhiteboard(whiteboardId!),
    enabled: Boolean(whiteboardId),
    // The canvas is the live copy once it mounts; refetching would only
    // replay a snapshot the editor already holds.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: retryTransientErrors,
  });
}

export function useCreateWhiteboard(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (title: string) => createWhiteboard({ pageKey, title }),
    onError: (error) => reportError(error, "Could not create that whiteboard."),
    onSettled: () =>
      client.invalidateQueries({ queryKey: whiteboardKeys.list(pageKey) }),
  });
}

export function useUpdateWhiteboard(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { whiteboardId: string; body: UpdateWhiteboardBody }) =>
      updateWhiteboard(input.whiteboardId, input.body),
    onSuccess: (response) => {
      client.setQueryData(
        whiteboardKeys.detail(response.whiteboard.id),
        response,
      );
      // The sidebar orders by last edit, so every save can reorder it.
      client.invalidateQueries({ queryKey: whiteboardKeys.list(pageKey) });
    },
    onError: (error) => reportError(error, "Could not save that whiteboard."),
  });
}

export function useDeleteWhiteboard(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (whiteboardId: string) => deleteWhiteboard(whiteboardId),
    onSuccess: (response) => {
      client.removeQueries({
        queryKey: whiteboardKeys.detail(response.whiteboard.id),
      });
    },
    onError: (error) => reportError(error, "Could not delete that whiteboard."),
    onSettled: () =>
      client.invalidateQueries({ queryKey: whiteboardKeys.list(pageKey) }),
  });
}
