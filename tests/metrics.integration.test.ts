import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { DailyPlannerService } from "@/lib/daily-planner/service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

// Distinct from the daily planner suite so parallel test files cannot delete
// each other's fixtures.
const USER_ONE = "00000000-0000-4000-8000-000000000011";
const USER_TWO = "00000000-0000-4000-8000-000000000012";
const ANCHOR = "2026-07-30";
const WEEK_START = "2026-07-27";
const WEEK_END = "2026-08-02";

describeDatabase("goal metrics database integration", () => {
  const client = postgres(databaseUrl!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  const service = new DailyPlannerService(db);

  beforeAll(async () => {
    const [result] = await client<
      [{ rlsTables: number; trigramIndex: number }]
    >`
      select
        (
          select count(*)::integer
          from pg_class
          where relname in ('metrics', 'task_metric_links')
          and relrowsecurity
        ) as "rlsTables",
        (
          select count(*)::integer
          from pg_indexes
          where indexname = 'tasks_title_trgm_idx'
        ) as "trigramIndex"
    `;
    expect(result).toEqual({ rlsTables: 2, trigramIndex: 1 });
  });

  beforeEach(async () => {
    await client`
      delete from auth.users
      where id in (${USER_ONE}::uuid, ${USER_TWO}::uuid)
    `;
    await client`
      insert into auth.users (id)
      values (${USER_ONE}::uuid), (${USER_TWO}::uuid)
    `;
  });

  afterAll(async () => {
    await client`
      delete from auth.users
      where id in (${USER_ONE}::uuid, ${USER_TWO}::uuid)
    `;
    await client.end();
  });

  async function completeTask(title: string, plannerDate?: string) {
    const { task } = await service.createTask(USER_ONE, { title, plannerDate });
    await service.setCompletion(USER_ONE, task.id, {
      completed: true,
      expectedVersion: task.version,
    });
    return task;
  }

  async function createGymMetric() {
    return service.createMetric(USER_ONE, {
      name: "Gym",
      keywords: ["gym", "workout"],
      targetCount: 5,
      period: "week",
    });
  }

  async function currentMetric(anchor = ANCHOR) {
    const { metrics } = await service.listMetrics(USER_ONE, { anchor });
    expect(metrics).toHaveLength(1);
    return metrics[0];
  }

  it("counts fuzzy keyword matches on completed tasks only", async () => {
    const metric = await createGymMetric();
    await completeTask("Gym", ANCHOR);
    await completeTask("gym session", "2026-07-29");
    await completeTask("Went to the GYM!", "2026-07-28");
    await completeTask("gymm", WEEK_START);
    await completeTask("Reply to email", ANCHOR);
    await service.createTask(USER_ONE, {
      title: "Gym warmup",
      plannerDate: ANCHOR,
    });

    const listed = await currentMetric();
    expect(listed).toMatchObject({
      id: metric.id,
      name: "Gym",
      keywords: ["gym", "workout"],
      targetCount: 5,
      period: "week",
      periodStart: WEEK_START,
      periodEnd: WEEK_END,
      currentCount: 4,
    });
    expect(listed.days).toHaveLength(7);
    expect(
      listed.days.filter(({ hit }) => hit).map(({ date }) => date),
    ).toEqual([WEEK_START, "2026-07-28", "2026-07-29", ANCHOR]);
  });

  it("lets explicit link overrides win over the fuzzy matcher", async () => {
    const metric = await createGymMetric();
    const matched = await completeTask("gym session", ANCHOR);
    const unmatched = await completeTask("Reply to email", ANCHOR);
    expect((await currentMetric()).currentCount).toBe(1);

    const excluded = await service.setMetricLink(USER_ONE, matched.id, {
      metricId: metric.id,
      state: "excluded",
    });
    expect(excluded.link).toMatchObject({ state: "excluded" });
    expect((await currentMetric()).currentCount).toBe(0);

    await service.setMetricLink(USER_ONE, unmatched.id, {
      metricId: metric.id,
      state: "included",
    });
    expect((await currentMetric()).currentCount).toBe(1);

    const cleared = await service.setMetricLink(USER_ONE, matched.id, {
      metricId: metric.id,
      state: "clear",
    });
    expect(cleared.link).toBeNull();
    expect((await currentMetric()).currentCount).toBe(2);
  });

  it("keeps previous weeks out of the current period count", async () => {
    await createGymMetric();
    await completeTask("Gym", ANCHOR);
    await completeTask("Last week gym", "2026-07-22");

    const listed = await currentMetric();
    expect(listed.currentCount).toBe(1);
    expect(listed.history).toHaveLength(8);
    expect(listed.history.at(-1)).toEqual({
      periodStart: WEEK_START,
      periodEnd: WEEK_END,
      count: 1,
    });
    expect(listed.history.at(-2)).toEqual({
      periodStart: "2026-07-20",
      periodEnd: "2026-07-26",
      count: 1,
    });
  });

  it("attributes unscheduled tasks across the Eastern DST transition", async () => {
    await createGymMetric();
    // Eastern clocks spring forward at 2026-03-08T07:00Z. Both instants fall on
    // 2026-03-09 in UTC, and both fall on 2026-03-08 at a fixed -05:00 offset,
    // so only the real zone splits them across the week boundary.
    const previousWeek = await completeTask("Gym"); // 23:30 EDT, Sunday the 8th
    const currentWeek = await completeTask("Gym again"); // 00:30 EDT, Monday the 9th
    await client`
      update tasks set completed_at = '2026-03-09T03:30:00Z'
      where id = ${previousWeek.id}
    `;
    await client`
      update tasks set completed_at = '2026-03-09T04:30:00Z'
      where id = ${currentWeek.id}
    `;

    const listed = await currentMetric("2026-03-09");
    expect(listed.periodStart).toBe("2026-03-09");
    expect(listed.periodEnd).toBe("2026-03-15");
    expect(listed.currentCount).toBe(1);
    expect(listed.history.at(-2)).toEqual({
      periodStart: "2026-03-02",
      periodEnd: "2026-03-08",
      count: 1,
    });
    expect(listed.days.filter(({ hit }) => hit)).toEqual([
      { date: "2026-03-09", hit: true },
    ]);
  });

  it("tracks daily and monthly periods from the same anchor", async () => {
    await service.createMetric(USER_ONE, {
      name: "Reading",
      keywords: ["read"],
      targetCount: 1,
      period: "day",
    });
    await service.createMetric(USER_ONE, {
      name: "Deep work",
      keywords: ["deep work"],
      targetCount: 10,
      period: "month",
    });
    await completeTask("Read a chapter", ANCHOR);
    await completeTask("Deep work block", "2026-07-02");

    const { metrics } = await service.listMetrics(USER_ONE, { anchor: ANCHOR });
    const [reading, deepWork] = metrics;
    expect(reading).toMatchObject({
      name: "Reading",
      periodStart: ANCHOR,
      periodEnd: ANCHOR,
      currentCount: 1,
      days: [{ date: ANCHOR, hit: true }],
    });
    expect(reading.history).toHaveLength(8);
    expect(reading.history[0]).toMatchObject({
      periodStart: "2026-07-23",
      periodEnd: "2026-07-23",
    });
    expect(deepWork).toMatchObject({
      name: "Deep work",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      currentCount: 1,
    });
    expect(deepWork.days).toHaveLength(31);
    expect(deepWork.history[0]).toMatchObject({
      periodStart: "2025-12-01",
      periodEnd: "2025-12-31",
    });
  });

  it("creates, updates, and archives metrics for their owner only", async () => {
    const metric = await createGymMetric();
    const updated = await service.updateMetric(USER_ONE, metric.id, {
      keywords: ["gym", "lift"],
      targetCount: 3,
    });
    expect(updated).toMatchObject({
      keywords: ["gym", "lift"],
      targetCount: 3,
      name: "Gym",
    });

    await expect(
      service.updateMetric(USER_TWO, metric.id, { targetCount: 9 }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.archiveMetric(USER_TWO, metric.id),
    ).rejects.toMatchObject({ status: 404 });

    const archived = await service.archiveMetric(USER_ONE, metric.id);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    const { metrics } = await service.listMetrics(USER_ONE, { anchor: ANCHOR });
    expect(metrics).toEqual([]);
    await expect(
      service.archiveMetric(USER_ONE, metric.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects link overrides for tasks or metrics owned by someone else", async () => {
    const metric = await createGymMetric();
    const task = await completeTask("Gym", ANCHOR);
    const otherTask = await service.createTask(USER_TWO, { title: "Gym" });

    await expect(
      service.setMetricLink(USER_ONE, otherTask.task.id, {
        metricId: metric.id,
        state: "included",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.setMetricLink(USER_TWO, task.id, {
        metricId: metric.id,
        state: "included",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("enforces RLS for direct authenticated database access", async () => {
    const metric = await createGymMetric();
    const task = await completeTask("Gym", ANCHOR);
    await service.setMetricLink(USER_ONE, task.id, {
      metricId: metric.id,
      state: "included",
    });

    await client.begin(async (transaction) => {
      await transaction.unsafe("set local role authenticated");
      await transaction`
        select set_config('request.jwt.claim.sub', ${USER_ONE}, true)
      `;
      const [ownerView] = await transaction<
        [{ metrics: number; links: number }]
      >`
        select
          (select count(*)::integer from public.metrics) as metrics,
          (select count(*)::integer from public.task_metric_links) as links
      `;
      expect(ownerView).toEqual({ metrics: 1, links: 1 });

      await transaction`
        select set_config('request.jwt.claim.sub', ${USER_TWO}, true)
      `;
      const [otherView] = await transaction<
        [{ metrics: number; links: number }]
      >`
        select
          (select count(*)::integer from public.metrics) as metrics,
          (select count(*)::integer from public.task_metric_links) as links
      `;
      expect(otherView).toEqual({ metrics: 0, links: 0 });
    });
  });
});
