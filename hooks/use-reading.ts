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
  createReadingItem,
  deleteReadingItem,
  fetchReadingItem,
  fetchReadingItems,
  searchBooks,
  updateReadingItem,
} from "@/lib/api/client";
import type {
  CreateReadingItemBody,
  ReadingItemPayload,
  ReadingItemResponse,
  ReadingResponse,
  UpdateReadingItemBody,
} from "@/lib/api/types";

export const readingKeys = {
  all: ["reading"] as const,
  list: ["reading", "list"] as const,
  item: (itemId: string) => ["reading", "item", itemId] as const,
  search: (title: string) => ["reading", "search", title] as const,
};

function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }

  toast.error(fallback);
}

function invalidateReading(client: QueryClient) {
  return client.invalidateQueries({ queryKey: readingKeys.all });
}

export function useReadingItems() {
  return useQuery({
    queryKey: readingKeys.list,
    queryFn: () => fetchReadingItems(),
    staleTime: 15_000,
  });
}

export function useReadingItem(
  itemId: string,
  initialItem: ReadingItemPayload,
) {
  return useQuery({
    queryKey: readingKeys.item(itemId),
    queryFn: () => fetchReadingItem(itemId),
    initialData: { item: initialItem } satisfies ReadingItemResponse,
    staleTime: 15_000,
  });
}

/**
 * The catalogue answer for a title does not change between one submission and
 * the next, so reopening the picker for the same words costs nothing.
 */
export function useBookSearch(title: string | null) {
  return useQuery({
    queryKey: readingKeys.search(title ?? ""),
    queryFn: () => searchBooks(title ?? ""),
    enabled: title !== null && title.trim() !== "",
    staleTime: 5 * 60_000,
  });
}

export function useCreateReadingItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateReadingItemBody) => createReadingItem(body),
    onSuccess: (result) => {
      if (result.duplicate) {
        toast.info(`Already saved: ${result.item.title}`);
        return;
      }
      toast.success(`Saved ${result.item.title}.`);
    },
    onError: (error) => reportError(error, "Could not save that."),
    onSettled: () => invalidateReading(client),
  });
}

export function useUpdateReadingItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { itemId: string; body: UpdateReadingItemBody }) =>
      updateReadingItem(input.itemId, input.body),
    // Swapping a cover is a direct manipulation of what is on screen, so the
    // image changes first and rolls back if the write is rejected.
    onMutate: async (input) => {
      const itemKey = readingKeys.item(input.itemId);
      await Promise.all([
        client.cancelQueries({ queryKey: readingKeys.list }),
        client.cancelQueries({ queryKey: itemKey }),
      ]);

      const previousList = client.getQueryData<ReadingResponse>(
        readingKeys.list,
      );
      const previousItem = client.getQueryData<ReadingItemResponse>(itemKey);
      const fields = stripVersion(input.body);

      if (previousList) {
        client.setQueryData<ReadingResponse>(readingKeys.list, {
          items: previousList.items.map((item) =>
            item.id === input.itemId ? { ...item, ...fields } : item,
          ),
        });
      }

      if (previousItem) {
        client.setQueryData<ReadingItemResponse>(itemKey, {
          item: { ...previousItem.item, ...fields },
        });
      }

      return { previousItem, previousList };
    },
    onError: (error, input, context) => {
      if (context?.previousList) {
        client.setQueryData(readingKeys.list, context.previousList);
      }
      if (context?.previousItem) {
        client.setQueryData(
          readingKeys.item(input.itemId),
          context.previousItem,
        );
      }
      reportError(error, "Could not update that entry.");
    },
    // The write bumps the version, and the next edit has to send the new one:
    // swapping two covers in quick succession would otherwise be a conflict.
    onSuccess: (result) => {
      client.setQueryData<ReadingItemResponse>(
        readingKeys.item(result.item.id),
        result,
      );
      client.setQueryData<ReadingResponse>(readingKeys.list, (current) =>
        current
          ? {
              items: current.items.map((item) =>
                item.id === result.item.id ? result.item : item,
              ),
            }
          : current,
      );
    },
    onSettled: () => invalidateReading(client),
  });
}

export function useDeleteReadingItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => deleteReadingItem(itemId),
    onSuccess: (result) => {
      // The detail page is still mounted while it navigates away; dropping the
      // entry keeps it from refetching a row that is gone.
      client.removeQueries({ queryKey: readingKeys.item(result.item.id) });
      toast.success(`Removed ${result.item.title}.`);
    },
    onError: (error) => reportError(error, "Could not remove that entry."),
    onSettled: () => client.invalidateQueries({ queryKey: readingKeys.list }),
  });
}

/** `expectedVersion` is a write-time guard, not a field the card displays. */
function stripVersion(body: UpdateReadingItemBody) {
  const fields: Partial<UpdateReadingItemBody> = { ...body };
  delete fields.expectedVersion;
  return fields;
}
