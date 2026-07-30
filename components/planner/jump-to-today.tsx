"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function JumpToToday({
  direction,
  onJump,
  visible,
}: {
  direction: "up" | "down";
  onJump: () => void;
  visible: boolean;
}) {
  const Chevron = direction === "up" ? ChevronUp : ChevronDown;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4",
        "transition-[opacity,transform] duration-200 ease-out",
        "motion-reduce:transition-none",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
      )}
    >
      <Button
        aria-hidden={!visible}
        className={cn(
          "rounded-4xl border border-border bg-card text-foreground shadow-sm",
          "hover:bg-muted",
          visible ? "pointer-events-auto" : "pointer-events-none",
        )}
        onClick={onJump}
        size="sm"
        tabIndex={visible ? 0 : -1}
        type="button"
        variant="secondary"
      >
        <Chevron data-icon="inline-start" />
        Today
      </Button>
    </div>
  );
}
