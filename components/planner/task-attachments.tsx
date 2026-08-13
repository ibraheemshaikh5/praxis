"use client";

import { FileText, RotateCw, X } from "lucide-react";

import type { PendingAttachment } from "@/hooks/use-task-attachments";
import { attachmentUrl } from "@/lib/api/client";
import type { TaskAttachmentPayload } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const TILE_CLASS =
  "group/tile relative size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted";

export function TaskAttachments({
  attachments,
  onDismiss,
  onRemove,
  onRetry,
  pending,
  taskId,
}: {
  attachments: TaskAttachmentPayload[];
  onDismiss: (attachmentId: string) => void;
  onRemove: (attachmentId: string) => void;
  onRetry: (attachmentId: string, fileName: string) => void;
  pending: PendingAttachment[];
  taskId: string;
}) {
  if (attachments.length === 0 && pending.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <ReadyTile
          attachment={attachment}
          key={attachment.id}
          onRemove={onRemove}
          taskId={taskId}
        />
      ))}
      {pending.map((item) => (
        <PendingTile
          item={item}
          key={item.id}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}

function ReadyTile({
  attachment,
  onRemove,
  taskId,
}: {
  attachment: TaskAttachmentPayload;
  onRemove: (attachmentId: string) => void;
  taskId: string;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const url = attachmentUrl(taskId, attachment.id);

  return (
    <div className={TILE_CLASS}>
      <a
        aria-label={`Open ${attachment.fileName}`}
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not an optimizable static asset.
          <img
            alt=""
            className="size-full object-cover"
            loading="lazy"
            src={url}
          />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center gap-0.5 px-1 text-muted-foreground"
            title={attachment.fileName}
          >
            <FileText className="size-4" />
            <span className="w-full truncate text-center text-[9px] leading-none">
              {attachment.fileName}
            </span>
          </div>
        )}
      </a>
      <button
        aria-label={`Remove ${attachment.fileName}`}
        className="absolute top-0.5 right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 transition-opacity group-hover/tile:opacity-100 hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => onRemove(attachment.id)}
        type="button"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function PendingTile({
  item,
  onDismiss,
  onRetry,
}: {
  item: PendingAttachment;
  onDismiss: (attachmentId: string) => void;
  onRetry: (attachmentId: string, fileName: string) => void;
}) {
  const failed = item.status === "failed";

  return (
    <div className={cn(TILE_CLASS, failed && "border-destructive/50")}>
      {item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimizable static asset.
        <img
          alt=""
          className={cn(
            "size-full object-cover",
            failed ? "opacity-40" : "opacity-70",
          )}
          src={item.previewUrl}
        />
      ) : (
        <div
          className="flex size-full flex-col items-center justify-center gap-0.5 px-1 text-muted-foreground"
          title={item.fileName}
        >
          <FileText className="size-4" />
          <span className="w-full truncate text-center text-[9px] leading-none">
            {item.fileName}
          </span>
        </div>
      )}

      {failed ? (
        <button
          aria-label={`Retry uploading ${item.fileName}`}
          className="absolute inset-0 flex items-center justify-center bg-background/60 text-destructive hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => onRetry(item.id, item.fileName)}
          title={`Upload failed. Retry ${item.fileName}.`}
          type="button"
        >
          <RotateCw className="size-4" />
        </button>
      ) : (
        <div
          aria-label={`Uploading ${item.fileName}`}
          className="absolute inset-0 flex items-center justify-center bg-background/50"
          role="status"
        >
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}

      {failed ? (
        <button
          aria-label={`Discard ${item.fileName}`}
          className="absolute top-0.5 right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => onDismiss(item.id)}
          type="button"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
