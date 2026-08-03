"use client";

import type { ReactNode } from "react";
import { CalendarDays, ListTodo } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PlannerView = "list" | "calendar";

export function PlannerViewToggle({
  view,
  onChange,
}: {
  view: PlannerView;
  onChange: (view: PlannerView) => void;
}) {
  return (
    <div
      aria-label="Planner view"
      className="inline-flex shrink-0 rounded-xl bg-muted p-0.5"
      role="group"
    >
      <ViewButton
        active={view === "list"}
        icon={<ListTodo />}
        label="List"
        onClick={() => onChange("list")}
      />
      <ViewButton
        active={view === "calendar"}
        icon={<CalendarDays />}
        label="Calendar"
        onClick={() => onChange("calendar")}
      />
    </div>
  );
}

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "h-8 gap-1.5 rounded-[0.625rem] px-2.5 text-xs shadow-none",
        active
          ? "bg-background text-foreground hover:bg-background"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      size="xs"
      variant="ghost"
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
