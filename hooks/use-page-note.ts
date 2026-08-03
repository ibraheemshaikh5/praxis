"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchPageNote, upsertPageNote } from "@/lib/api/client";
import type { PageNoteResponse } from "@/lib/api/types";

export const pageNoteKeys = {
  detail: (pageKey: string) => ["page-note", pageKey] as const,
};

export function usePageNote(pageKey: string) {
  return useQuery({
    queryKey: pageNoteKeys.detail(pageKey),
    queryFn: () => fetchPageNote(pageKey),
    enabled: Boolean(pageKey),
  });
}

export function useSavePageNote(pageKey: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => upsertPageNote({ pageKey, content }),
    onSuccess: (response) => {
      client.setQueryData<PageNoteResponse>(
        pageNoteKeys.detail(pageKey),
        response,
      );
    },
  });
}
