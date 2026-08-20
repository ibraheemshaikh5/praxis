"use client";

import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteKnowledgeItem } from "@/hooks/use-knowledge";
import { cn } from "@/lib/utils";

/**
 * Removal is outright and reachable from the shelf as well as the entry, so the
 * confirmation is shared and each place supplies only its own trigger.
 */
export function RemoveKnowledgeItemDialog({
  item,
  onOpenChange,
  onRemoved,
  open,
}: {
  item: { id: string; title: string };
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
  open: boolean;
}) {
  const deleteItem = useDeleteKnowledgeItem();

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!deleteItem.isPending) onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {item.title}?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={deleteItem.isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={deleteItem.isPending}
            onClick={() =>
              deleteItem.mutate(item.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  onRemoved?.();
                },
              })
            }
            variant="destructive"
          >
            {deleteItem.isPending ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : null}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The card's trigger: it sits over the cover, so it matches the cover picker. */
export function RemoveItemButton({
  className,
  onClick,
  title,
}: {
  className?: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={`Remove ${title}`}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-4xl bg-background/85 text-muted-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
