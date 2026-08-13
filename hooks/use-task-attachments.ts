"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { plannerKeys } from "@/hooks/use-planner";
import {
  ApiError,
  confirmAttachment,
  deleteAttachment,
  reserveAttachment,
  retryAttachment,
} from "@/lib/api/client";
import type { UploadTargetPayload } from "@/lib/api/types";
import { TASK_ATTACHMENTS_BUCKET } from "@/lib/daily-planner/storage";
import { plannerPageIndex, type PlannerDateKey } from "@/lib/planner/dates";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);
const MAX_BYTES = 26_214_400;

export type PendingAttachment = {
  id: string;
  fileName: string;
  previewUrl: string | null;
  status: "uploading" | "failed";
};

/**
 * Tracks in-flight and failed attachment uploads for one task. The planner
 * list only ever returns "ready" attachments, so anything still pending or
 * failed exists solely in this hook's state for the lifetime of the tab.
 */
export function useTaskAttachments(taskId: string, dateKey: PlannerDateKey) {
  const client = useQueryClient();
  const [pending, setPending] = React.useState<PendingAttachment[]>([]);
  const filesRef = React.useRef(new Map<string, File>());

  const invalidate = React.useCallback(
    () =>
      client.invalidateQueries({
        queryKey: plannerKeys.page(plannerPageIndex(dateKey)),
      }),
    [client, dateKey],
  );

  const runUpload = React.useCallback(
    async (
      attachmentId: string,
      fileName: string,
      target: UploadTargetPayload,
      file: File,
    ) => {
      filesRef.current.set(attachmentId, file);
      setPending((current) => [
        ...current.filter((item) => item.id !== attachmentId),
        {
          id: attachmentId,
          fileName,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null,
          status: "uploading",
        },
      ]);

      try {
        const supabase = createBrowserSupabaseClient();
        await supabase.storage
          .from(TASK_ATTACHMENTS_BUCKET)
          .uploadToSignedUrl(target.path, target.token, file, {
            upsert: true,
          });
      } catch {
        // Confirmation below re-verifies the object and records the failure.
      }

      try {
        await confirmAttachment(taskId, attachmentId);
        setPending((current) =>
          current.filter((item) => item.id !== attachmentId),
        );
        filesRef.current.delete(attachmentId);
        void invalidate();
      } catch {
        setPending((current) =>
          current.map((item) =>
            item.id === attachmentId ? { ...item, status: "failed" } : item,
          ),
        );
      }
    },
    [invalidate, taskId],
  );

  const upload = React.useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
          toast.error(`${file.name} isn't a supported file type.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is larger than 25 MB.`);
          continue;
        }

        void (async () => {
          try {
            const { attachment, upload: target } = await reserveAttachment(
              taskId,
              {
                fileName: file.name,
                mimeType: file.type,
                byteSize: file.size,
              },
            );
            await runUpload(attachment.id, file.name, target, file);
          } catch (error) {
            toast.error(
              error instanceof ApiError
                ? error.message
                : `Could not attach ${file.name}.`,
            );
          }
        })();
      }
    },
    [runUpload, taskId],
  );

  const retry = React.useCallback(
    (attachmentId: string, fileName: string) => {
      const file = filesRef.current.get(attachmentId);
      if (!file) return;

      setPending((current) =>
        current.map((item) =>
          item.id === attachmentId ? { ...item, status: "uploading" } : item,
        ),
      );

      void (async () => {
        try {
          const { upload: target } = await retryAttachment(
            taskId,
            attachmentId,
          );
          await runUpload(attachmentId, fileName, target, file);
        } catch (error) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : `Could not retry ${fileName}.`,
          );
          setPending((current) =>
            current.map((item) =>
              item.id === attachmentId
                ? { ...item, status: "failed" }
                : item,
            ),
          );
        }
      })();
    },
    [runUpload, taskId],
  );

  const dismiss = React.useCallback((attachmentId: string) => {
    setPending((current) =>
      current.filter((item) => item.id !== attachmentId),
    );
    filesRef.current.delete(attachmentId);
  }, []);

  const remove = React.useCallback(
    (attachmentId: string) => {
      void (async () => {
        try {
          await deleteAttachment(taskId, attachmentId);
          void invalidate();
        } catch (error) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Could not remove that attachment.",
          );
        }
      })();
    },
    [invalidate, taskId],
  );

  return { pending, upload, retry, dismiss, remove };
}
