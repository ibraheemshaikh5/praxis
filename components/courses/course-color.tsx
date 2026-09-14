"use client";

import {
  TASK_COLOR_KEYS,
  type TaskColorKey,
} from "@/lib/daily-planner/appearance";
import { cn } from "@/lib/utils";

/** The same swatches a planner task can wear, so a class matches its tasks. */
export const COURSE_COLOR_CLASSES: Record<TaskColorKey, string> = {
  olive: "bg-primary",
  sage: "bg-chart-2",
  apricot: "bg-chart-3",
  rose: "bg-destructive",
  sky: "bg-chart-5",
  ink: "bg-foreground",
};

export function CourseColorDot({
  colorKey,
  className,
}: {
  colorKey: TaskColorKey;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        COURSE_COLOR_CLASSES[colorKey],
        className,
      )}
    />
  );
}

export function CourseColorSwatches({
  value,
  onChange,
}: {
  value: TaskColorKey;
  onChange: (colorKey: TaskColorKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group">
      {TASK_COLOR_KEYS.map((key) => (
        <button
          aria-label={key}
          aria-pressed={value === key}
          className={cn(
            "size-6 rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none",
            COURSE_COLOR_CLASSES[key],
            value === key &&
              "ring-2 ring-foreground/60 ring-offset-2 ring-offset-background",
          )}
          key={key}
          onClick={() => onChange(key)}
          type="button"
        />
      ))}
    </div>
  );
}
