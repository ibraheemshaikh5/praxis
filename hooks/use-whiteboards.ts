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
  createWhiteboard,
  deleteWhiteboard,
  fetchWhiteboard,
  fetchWhiteboards,
  updateWhiteboard,
} from "@/lib/api/client";
import { applyOptimistically } from "@/lib/api/optimistic";
import type {
  UpdateWhiteboardBody,
  WhiteboardResponse,
  WhiteboardsResponse,
  WhiteboardSummaryPayload,
} from "@/lib/api/types";

export const whiteboardKeys = {
  list: (pageKey: string) => ["whiteboards", "list", pageKey] as const,
  detail: (whiteboardId: string) =>
    ["whiteboards", "detail", whiteboardId] as const,
};

function reportError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

/** The sidebar orders by last edit; every save reorders it locally. */
function sortBoards(boards: WhiteboardSummaryPayload[]) {
  return [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function editBoardRow(
  client: QueryClient,
  pageKey: string,
  whiteboardId: string,
  patch: Partial<WhiteboardSummaryPayload>,
) {
  client.setQueryData<WhiteboardsResponse>(
    whiteboardKeys.list(pageKey),
    (current) =>
      current
        ? {
            whiteboards: sortBoards(
              current.whiteboards.map((board) =>
                board.id === whiteboardId ? { ...board, ...patch } : board,
              ),
            ),
          }
        : current,
  );
}

export function useWhiteboards(pageKey: string, enabled = true) {
  return useQuery({
    queryKey: whiteboardKeys.list(pageKey),
    queryFn: () => fetchWhiteboards(pageKey),
    enabled: enabled && Boolean(pageKey),
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
  });
}

export function useCreateWhiteboard(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (title: string) => createWhiteboard({ pageKey, title }),
    onError: (error) => reportError(error, "Could not create that whiteboard."),
    // The server assigns the id, so the row appears when the response lands:
    // seeding both caches lets the new board open without waiting for the
    // list refetch.
    onSuccess: (response) => {
      const { id, title, createdAt, updatedAt } = response.whiteboard;
      client.setQueryData<WhiteboardResponse>(
        whiteboardKeys.detail(id),
        response,
      );
      client.setQueryData<WhiteboardsResponse>(
        whiteboardKeys.list(pageKey),
        (current) =>
          current
            ? {
                whiteboards: sortBoards([
                  { id, title, createdAt, updatedAt },
                  ...current.whiteboards,
                ]),
              }
            : current,
      );
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: whiteboardKeys.list(pageKey) }),
  });
}

export function useUpdateWhiteboard(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { whiteboardId: string; body: UpdateWhiteboardBody }) =>
      updateWhiteboard(input.whiteboardId, input.body),
    async onMutate(input) {
      const detailKey = whiteboardKeys.detail(input.whiteboardId);
      const rollback = await applyOptimistically(
        client,
        [whiteboardKeys.list(pageKey), detailKey],
        () => {
          const now = new Date().toISOString();
          editBoardRow(client, pageKey, input.whiteboardId, {
            ...(input.body.title === undefined
              ? {}
              : { title: input.body.title }),
            updatedAt: now,
          });
          client.setQueryData<WhiteboardResponse>(detailKey, (current) =>
            current
              ? {
                  whiteboard: {
                    ...current.whiteboard,
                    ...input.body,
                    updatedAt: now,
                  },
                }
              : current,
          );
        },
      );
      return { rollback };
    },
    // Saves land every debounce interval while drawing, so the list is kept
    // current from the response instead of refetched on every stroke pause.
    // The document itself is not written back: the editor is already ahead of
    // it, and a slow response must not resurface an older snapshot.
    onSuccess: (response) => {
      const { title, updatedAt } = response.whiteboard;
      editBoardRow(client, pageKey, response.whiteboard.id, {
        title,
        updatedAt,
      });
      client.setQueryData<WhiteboardResponse>(
        whiteboardKeys.detail(response.whiteboard.id),
        (current) =>
          current
            ? { whiteboard: { ...current.whiteboard, title, updatedAt } }
            : current,
      );
    },
    onError(error, input, context) {
      context?.rollback();
      reportError(error, "Could not save that whiteboard.");
      // Resync both copies; concurrent saves may have raced the rollback.
      void client.invalidateQueries({
        queryKey: whiteboardKeys.list(pageKey),
      });
      void client.invalidateQueries({
        queryKey: whiteboardKeys.detail(input.whiteboardId),
      });
    },
  });
}

export function useDeleteWhiteboard(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (whiteboardId: string) => deleteWhiteboard(whiteboardId),
    async onMutate(whiteboardId) {
      const queryKey = whiteboardKeys.list(pageKey);
      const rollback = await applyOptimistically(client, [queryKey], () => {
        client.setQueryData<WhiteboardsResponse>(queryKey, (current) =>
          current
            ? {
                whiteboards: current.whiteboards.filter(
                  (board) => board.id !== whiteboardId,
                ),
              }
            : current,
        );
      });
      return { rollback };
    },
    onSuccess: (response) => {
      client.removeQueries({
        queryKey: whiteboardKeys.detail(response.whiteboard.id),
      });
    },
    onError(error, _input, context) {
      context?.rollback();
      reportError(error, "Could not delete that whiteboard.");
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: whiteboardKeys.list(pageKey) }),
  });
}
