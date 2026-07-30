"use client";

import { useTimelineNav } from "@/components/planner/timeline-nav";
import { Button } from "@/components/ui/button";

export function TodayButton() {
  const { jumpToToday, visible } = useTimelineNav();

  if (!visible) {
    return null;
  }

  return (
    <Button
      aria-label="Jump to today"
      className="rounded-4xl"
      onClick={jumpToToday}
      size="sm"
      type="button"
      variant="ghost"
    >
      Today
    </Button>
  );
}
