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
  createKnowledgeItem,
  deleteKnowledgeItem,
  fetchKnowledgeItem,
  fetchKnowledgeItems,
  searchBooks,
  updateKnowledgeItem,
} from "@/lib/api/client";
import type {
  CreateKnowledgeItemBody,
  KnowledgeItemPayload,
  KnowledgeItemResponse,
  KnowledgeResponse,
  UpdateKnowledgeItemBody,
} from "@/lib/api/types";

export const knowledgeKeys = {
  all: ["knowledge"] as const,
  list: ["knowledge", "list"] as const,
  item: (itemId: string) => ["knowledge", "item", itemId] as const,
  search: (title: string) => ["knowledge", "search", title] as const,
};

function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }

  toast.error(fallback);
}

function invalidateKnowledge(client: QueryClient) {
  return client.invalidateQueries({ queryKey: knowledgeKeys.all });
}

export function useKnowledgeItems() {
  return useQuery({
    queryKey: knowledgeKeys.list,
    queryFn: () => fetchKnowledgeItems(),
    staleTime: 15_000,
  });
}

export function useKnowledgeItem(
  itemId: string,
  initialItem: KnowledgeItemPayload,
) {
  return useQuery({
    queryKey: knowledgeKeys.item(itemId),
    queryFn: () => fetchKnowledgeItem(itemId),
    initialData: { item: initialItem } satisfies KnowledgeItemResponse,
    staleTime: 15_000,
  });
}

/**
 * The catalogue answer for a title does not change between one submission and
 * the next, so reopening the picker for the same words costs nothing.
 */
export function useBookSearch(title: string | null) {
  return useQuery({
    queryKey: knowledgeKeys.search(title ?? ""),
    queryFn: () => searchBooks(title ?? ""),
    enabled: title !== null && title.trim() !== "",
    staleTime: 5 * 60_000,
  });
}

export function useCreateKnowledgeItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateKnowledgeItemBody) => createKnowledgeItem(body),
    onSuccess: (result) => {
      if (result.duplicate) {
        toast.info(`Already saved: ${result.item.title}`);
        return;
      }
      toast.success(`Saved ${result.item.title}.`);
    },
    onError: (error) => reportError(error, "Could not save that."),
    onSettled: () => invalidateKnowledge(client),
  });
}

export function useUpdateKnowledgeItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { itemId: string; body: UpdateKnowledgeItemBody }) =>
      updateKnowledgeItem(input.itemId, input.body),
    // Swapping a cover is a direct manipulation of what is on screen, so the
    // image changes first and rolls back if the write is rejected.
    onMutate: async (input) => {
      const itemKey = knowledgeKeys.item(input.itemId);
      await Promise.all([
        client.cancelQueries({ queryKey: knowledgeKeys.list }),
        client.cancelQueries({ queryKey: itemKey }),
      ]);

      const previousList = client.getQueryData<KnowledgeResponse>(
        knowledgeKeys.list,
      );
      const previousItem = client.getQueryData<KnowledgeItemResponse>(itemKey);
      const fields = stripVersion(input.body);

      if (previousList) {
        client.setQueryData<KnowledgeResponse>(knowledgeKeys.list, {
          items: previousList.items.map((item) =>
            item.id === input.itemId ? { ...item, ...fields } : item,
          ),
        });
      }

      if (previousItem) {
        client.setQueryData<KnowledgeItemResponse>(itemKey, {
          item: { ...previousItem.item, ...fields },
        });
      }

      return { previousItem, previousList };
    },
    onError: (error, input, context) => {
      if (context?.previousList) {
        client.setQueryData(knowledgeKeys.list, context.previousList);
      }
      if (context?.previousItem) {
        client.setQueryData(
          knowledgeKeys.item(input.itemId),
          context.previousItem,
        );
      }
      reportError(error, "Could not update that entry.");
    },
    // The write bumps the version, and the next edit has to send the new one:
    // swapping two covers in quick succession would otherwise be a conflict.
    onSuccess: (result) => {
      client.setQueryData<KnowledgeItemResponse>(
        knowledgeKeys.item(result.item.id),
        result,
      );
      client.setQueryData<KnowledgeResponse>(knowledgeKeys.list, (current) =>
        current
          ? {
              items: current.items.map((item) =>
                item.id === result.item.id ? result.item : item,
              ),
            }
          : current,
      );
    },
    onSettled: () => invalidateKnowledge(client),
  });
}

export function useDeleteKnowledgeItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => deleteKnowledgeItem(itemId),
    onSuccess: (result) => {
      // The detail page is still mounted while it navigates away; dropping the
      // entry keeps it from refetching a row that is gone.
      client.removeQueries({ queryKey: knowledgeKeys.item(result.item.id) });
      toast.success(`Removed ${result.item.title}.`);
    },
    onError: (error) => reportError(error, "Could not remove that entry."),
    onSettled: () => client.invalidateQueries({ queryKey: knowledgeKeys.list }),
  });
}

/** `expectedVersion` is a write-time guard, not a field the card displays. */
function stripVersion(body: UpdateKnowledgeItemBody) {
  const fields: Partial<UpdateKnowledgeItemBody> = { ...body };
  delete fields.expectedVersion;
  return fields;
}
