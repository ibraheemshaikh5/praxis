"use client";

import { useTimelineNav } from "@/components/planner/timeline-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TodayButton() {
  const { jumpToToday, visible } = useTimelineNav();

  return (
    <Button
      aria-label="Jump to today"
      className={cn(
        "rounded-4xl",
        !visible && "text-muted-foreground",
      )}
      disabled={!visible}
      onClick={jumpToToday}
      size="sm"
      type="button"
      variant="ghost"
    >
      Today
    </Button>
  );
}
