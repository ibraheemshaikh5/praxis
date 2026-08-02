import { APPLICATION_STATUS_LABELS } from "@/lib/applications/status";
import type { ApplicationStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Colour carries meaning sparingly: in-flight stages get a low-chroma tint from
 * the olive chart ramp, and only Accepted takes the solid primary fill.
 */
const STATUS_STYLES: Record<ApplicationStatus, { badge: string; dot: string }> =
  {
    applied: {
      badge: "bg-muted text-muted-foreground",
      dot: "bg-muted-foreground/50",
    },
    oa_received: {
      badge: "bg-chart-3/20 text-foreground",
      dot: "bg-chart-3",
    },
    oa_completed: {
      badge: "bg-chart-2/20 text-foreground",
      dot: "bg-chart-2",
    },
    interview: {
      badge: "bg-chart-1/20 text-foreground",
      dot: "bg-chart-1",
    },
    offer: {
      badge: "bg-primary/15 text-foreground",
      dot: "bg-primary",
    },
    accepted: {
      badge: "bg-primary text-primary-foreground",
      dot: "bg-primary-foreground",
    },
    rejected: {
      badge: "bg-destructive/10 text-destructive",
      dot: "bg-destructive/70",
    },
    ghosted: {
      badge: "border border-dashed border-border text-muted-foreground",
      dot: "bg-muted-foreground/40",
    },
  };

export function StatusBadge({
  className,
  status,
}: {
  className?: string;
  status: ApplicationStatus;
}) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap",
        style.badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", style.dot)} />
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
