import type { DailyPlannerService } from "@/lib/daily-planner/service";

type MetricsResult = Awaited<ReturnType<DailyPlannerService["listMetrics"]>>;
type Metric = MetricsResult["metrics"][number];

export type GoalSummary = {
  goal_id: string;
  name: string;
  period: Metric["period"];
  period_start: string;
  period_end: string;
  count: number;
  target: number;
  remaining: number;
  met: boolean;
  ends_on: string | null;
  keywords: string[];
  previous_periods?: { start: string; end: string; count: number }[];
};

export type GoalChange = {
  goal: string;
  period_start: string;
  period_end: string;
  before: number;
  after: number;
  target: number;
  /** True only when this change carried the goal to its target. */
  reached_target: boolean;
};

export function summarizeGoals(
  result: MetricsResult,
  { includeHistory = false } = {},
): GoalSummary[] {
  return result.metrics.map((metric) => ({
    goal_id: metric.id,
    name: metric.name,
    period: metric.period,
    period_start: metric.periodStart,
    period_end: metric.periodEnd,
    count: metric.currentCount,
    target: metric.targetCount,
    remaining: Math.max(0, metric.targetCount - metric.currentCount),
    met: metric.currentCount >= metric.targetCount,
    ends_on: metric.endsOn,
    keywords: metric.keywords,
    ...(includeHistory
      ? {
          // The history includes the current period last; it is already the
          // `count` above, so only the earlier ones are listed.
          previous_periods: metric.history.slice(0, -1).map((period) => ({
            start: period.periodStart,
            end: period.periodEnd,
            count: period.count,
          })),
        }
      : {}),
  }));
}

export function diffGoals(
  before: MetricsResult,
  after: MetricsResult,
): GoalChange[] {
  const previous = new Map(before.metrics.map((metric) => [metric.id, metric]));
  const changes: GoalChange[] = [];

  for (const metric of after.metrics) {
    const earlier = previous.get(metric.id);
    // A goal created between the two reads has no baseline to compare.
    if (!earlier || earlier.currentCount === metric.currentCount) continue;
    changes.push({
      goal: metric.name,
      period_start: metric.periodStart,
      period_end: metric.periodEnd,
      before: earlier.currentCount,
      after: metric.currentCount,
      target: metric.targetCount,
      reached_target:
        earlier.currentCount < metric.targetCount &&
        metric.currentCount >= metric.targetCount,
    });
  }
  return changes;
}

/**
 * How long to wait before each re-read when a completion has not shown up in
 * goal progress yet. Progress is computed from committed rows, so the first
 * read normally sees the change; the later reads cover the write landing on a
 * pooled connection a moment after this one reads. When nothing moves after
 * the last read, the task counts toward no goal.
 */
export const GOAL_SETTLE_DELAYS_MS = [0, 400, 1000];

export async function settledGoalChanges(
  read: () => Promise<MetricsResult>,
  before: MetricsResult,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<GoalChange[]> {
  for (const delay of GOAL_SETTLE_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    const changes = diffGoals(before, await read());
    if (changes.length > 0) return changes;
  }
  return [];
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
