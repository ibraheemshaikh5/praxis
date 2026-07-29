"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CirclePlus,
  Inbox,
  ListTodo,
  MoreHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PlannerItem = {
  id: string;
  task: string;
  note?: string;
  completed: boolean;
};

const initialItems: PlannerItem[] = [
  {
    id: "outline",
    task: "Outline the week’s three priorities",
    note: "Keep the list specific enough to finish.",
    completed: false,
  },
  {
    id: "reply",
    task: "Reply to internship follow-ups",
    completed: false,
  },
  {
    id: "walk",
    task: "Take a walk after lunch",
    completed: true,
  },
];

const plannerTimeZone = "America/New_York";

function getPlannerToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: plannerTimeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      12,
    ),
  );
}

function addPlannerDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function plannerDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function PlannerSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading today’s tasks" role="status">
      {[0, 1, 2].map((item) => (
        <div
          className="h-[76px] animate-pulse rounded-xl bg-muted/80 motion-reduce:animate-none"
          key={item}
        />
      ))}
      <span className="sr-only">Loading today’s tasks</span>
    </div>
  );
}

function TaskRow({
  item,
  onRemove,
  onToggle,
}: {
  item: PlannerItem;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <article className="group flex min-w-0 items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-card/80">
      <Checkbox
        aria-label={`Mark ${item.task} as ${item.completed ? "incomplete" : "complete"}`}
        checked={item.completed}
        className="mt-0.5"
        onCheckedChange={() => onToggle(item.id)}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[15px] font-medium leading-5",
            item.completed && "text-muted-foreground line-through",
          )}
        >
          {item.task}
        </p>
        {item.note ? (
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {item.note}
          </p>
        ) : null}
      </div>
      <Button
        aria-label={`Remove ${item.task}`}
        className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={() => onRemove(item.id)}
        size="icon-sm"
        variant="ghost"
      >
        <Trash2 />
      </Button>
    </article>
  );
}

export function DailyPlanner() {
  const [selectedDate, setSelectedDate] = React.useState(getPlannerToday);
  const [itemsByDate, setItemsByDate] = React.useState<
    Record<string, PlannerItem[]>
  >(() => ({
    [plannerDateKey(getPlannerToday())]: initialItems,
  }));
  const [task, setTask] = React.useState("");
  const [note, setNote] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const taskInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(timeout);
  }, []);

  React.useEffect(() => {
    if (formOpen) {
      taskInputRef.current?.focus();
    }
  }, [formOpen]);

  function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTask = task.trim();

    if (!cleanTask) {
      setError("Write a task before adding it.");
      taskInputRef.current?.focus();
      return;
    }

    const selectedKey = plannerDateKey(selectedDate);
    setItemsByDate((current) => ({
      ...current,
      [selectedKey]: [
        {
          id: crypto.randomUUID(),
          task: cleanTask,
          note: note.trim() || undefined,
          completed: false,
        },
        ...(current[selectedKey] ?? []),
      ],
    }));
    setTask("");
    setNote("");
    setError("");
    setFormOpen(false);
  }

  function toggleItem(id: string) {
    const selectedKey = plannerDateKey(selectedDate);
    setItemsByDate((current) => ({
      ...current,
      [selectedKey]: (current[selectedKey] ?? []).map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    }));
  }

  function removeItem(id: string) {
    const selectedKey = plannerDateKey(selectedDate);
    setItemsByDate((current) => ({
      ...current,
      [selectedKey]: (current[selectedKey] ?? []).filter(
        (item) => item.id !== id,
      ),
    }));
  }

  const items = itemsByDate[plannerDateKey(selectedDate)] ?? [];
  const openItems = items.filter((item) => !item.completed);
  const completedItems = items.filter((item) => item.completed);
  const visibleDays = [-2, -1, 0, 1, 2].map((offset) =>
    addPlannerDays(selectedDate, offset),
  );
  const selectedDateLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(selectedDate);
  const viewingToday =
    plannerDateKey(selectedDate) === plannerDateKey(getPlannerToday());

  return (
    <main className="min-h-[100dvh] bg-background">
      <div className="grid min-h-[100dvh] lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r bg-sidebar px-4 py-5 lg:flex lg:flex-col">
          <div className="flex h-10 items-center gap-3 px-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Check className="size-4" strokeWidth={2.2} />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">
              Praxis
            </span>
          </div>

          <nav aria-label="Primary" className="mt-8 space-y-1">
            <Button
              className="w-full justify-start rounded-xl bg-sidebar-accent text-sidebar-accent-foreground"
              variant="ghost"
            >
              <ListTodo data-icon="inline-start" />
              Daily planner
            </Button>
            <Button
              className="w-full justify-start rounded-xl text-muted-foreground"
              disabled
              variant="ghost"
            >
              <Sparkles data-icon="inline-start" />
              More soon
            </Button>
          </nav>

          <div className="mt-auto rounded-xl border bg-background/60 p-3">
            <p className="text-xs font-medium">Daily reset</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Unfinished tasks stay with their original day.
            </p>
          </div>
        </aside>

        <section className="relative min-w-0 overflow-hidden">
          <div className="planner-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_42%)]" />

          <header className="relative flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Check className="size-4" strokeWidth={2.2} />
              </div>
              <span className="font-semibold tracking-tight">Praxis</span>
            </div>
            <p className="hidden text-sm text-muted-foreground lg:block">
              Daily planner
            </p>
            <div className="flex items-center gap-2">
              <Button
                aria-label="Previous day"
                onClick={() =>
                  setSelectedDate((current) => addPlannerDays(current, -1))
                }
                size="icon-sm"
                variant="ghost"
              >
                <ArrowLeft />
              </Button>
              <Button
                aria-label="Next day"
                onClick={() =>
                  setSelectedDate((current) => addPlannerDays(current, 1))
                }
                size="icon-sm"
                variant="ghost"
              >
                <ArrowRight />
              </Button>
              <Button
                aria-label="More planner options"
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </div>
          </header>

          <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_260px] xl:gap-16">
              <div className="min-w-0">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-primary">
                      {viewingToday ? "Today" : "Daily plan"}
                    </p>
                    <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                      {selectedDateLabel}
                    </h1>
                  </div>
                  <p className="hidden text-sm text-muted-foreground sm:block">
                    {openItems.length}{" "}
                    {openItems.length === 1 ? "task" : "tasks"} left
                  </p>
                </div>

                <div className="mt-7 grid grid-cols-5 gap-1 rounded-2xl border bg-card/80 p-1.5 shadow-[0_16px_50px_oklch(0.25_0.02_110/0.05)]">
                  {visibleDays.map((day) => {
                    const active =
                      plannerDateKey(day) === plannerDateKey(selectedDate);
                    const weekday = new Intl.DateTimeFormat("en-US", {
                      timeZone: "UTC",
                      weekday: "short",
                    }).format(day);

                    return (
                      <button
                        aria-label={new Intl.DateTimeFormat("en-US", {
                          day: "numeric",
                          month: "long",
                          timeZone: "UTC",
                          weekday: "long",
                        }).format(day)}
                        className={cn(
                          "rounded-xl px-2 py-2.5 text-center transition-colors active:translate-y-px",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        key={plannerDateKey(day)}
                        onClick={() => setSelectedDate(day)}
                        type="button"
                      >
                        <span className="block text-[11px] font-medium uppercase tracking-[0.12em]">
                          {weekday}
                        </span>
                        <span className="mt-1 block text-sm font-semibold">
                          {day.getUTCDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <section aria-labelledby="tasks-heading" className="mt-8">
                  <div className="flex items-center justify-between px-3">
                    <h2 className="text-sm font-semibold" id="tasks-heading">
                      To do
                    </h2>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {openItems.length}
                    </span>
                  </div>

                  <div className="mt-2">
                    {loading ? (
                      <PlannerSkeleton />
                    ) : openItems.length ? (
                      <div className="space-y-1">
                        {openItems.map((item) => (
                          <TaskRow
                            item={item}
                            key={item.id}
                            onRemove={removeItem}
                            onToggle={toggleItem}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
                        <Inbox className="mx-auto size-5 text-primary" />
                        <p className="mt-3 text-sm font-medium">
                          The day is clear.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Add something only if it deserves your attention.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <div className="mt-4">
                  {formOpen ? (
                    <form
                      className="rounded-2xl border bg-card p-4 shadow-[0_18px_50px_oklch(0.25_0.02_110/0.08)]"
                      onSubmit={addItem}
                    >
                      <div className="space-y-2">
                        <Label htmlFor="task">Task</Label>
                        <Input
                          aria-describedby={error ? "task-error" : undefined}
                          aria-invalid={Boolean(error)}
                          id="task"
                          onChange={(event) => {
                            setTask(event.target.value);
                            if (error) setError("");
                          }}
                          placeholder="What needs your attention?"
                          ref={taskInputRef}
                          value={task}
                        />
                        {error ? (
                          <p
                            className="text-sm text-destructive"
                            id="task-error"
                          >
                            {error}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label htmlFor="note">Note (optional)</Label>
                        <Textarea
                          id="note"
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Add context, a link, or the next step."
                          value={note}
                        />
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          onClick={() => {
                            setFormOpen(false);
                            setError("");
                          }}
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                        <Button type="submit">Add task</Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      className="w-full justify-start rounded-xl border-dashed text-muted-foreground hover:text-foreground"
                      onClick={() => setFormOpen(true)}
                      variant="outline"
                    >
                      <CirclePlus data-icon="inline-start" />
                      Add a task
                    </Button>
                  )}
                </div>

                {completedItems.length ? (
                  <section aria-labelledby="completed-heading" className="mt-9">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold"
                      type="button"
                    >
                      <ChevronDown className="size-4 text-muted-foreground" />
                      <span id="completed-heading">Completed</span>
                      <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                        {completedItems.length}
                      </span>
                    </button>
                    <div className="mt-1 space-y-1">
                      {completedItems.map((item) => (
                        <TaskRow
                          item={item}
                          key={item.id}
                          onRemove={removeItem}
                          onToggle={toggleItem}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              <aside className="hidden xl:block">
                <div className="sticky top-28 space-y-6">
                  <div>
                    <CalendarDays className="size-5 text-primary" />
                    <p className="mt-4 text-sm font-semibold">A lighter day</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Keep the list honest. Finishing three useful things is
                      enough.
                    </p>
                  </div>
                  <div className="border-t pt-5">
                    <p className="font-mono text-xs text-muted-foreground">
                      Press D to change theme
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
