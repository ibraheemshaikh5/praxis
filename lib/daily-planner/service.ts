import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/lib/db/client";
import {
  metrics,
  plannerEntries,
  profiles,
  taskAttachments,
  taskMetricLinks,
  tasks,
} from "@/lib/db/schema";

import type {
  CompletionInput,
  CreateMetricInput,
  CreateTaskInput,
  MetricsQuery,
  PlannerRangeQuery,
  ReorderPlannerInput,
  ReserveAttachmentInput,
  ScheduleTaskInput,
  SetMetricLinkInput,
  UpdateMetricInput,
  UpdateTaskInput,
} from "./contracts";
import { ConflictError, NotFoundError, StorageError } from "./errors";
import type { AttachmentStorage } from "./storage";
import { calendarDateInTimeZone, validateTimeBlock } from "./time";

const POSITION_STEP = 1024;
const RECOVERY_DAYS = 30;
const PENDING_UPLOAD_HOURS = 24;
// pg_trgm word_similarity cutoff a keyword must reach against a task title.
const METRIC_MATCH_THRESHOLD = 0.6;
// The current period plus the seven that precede it.
const METRIC_HISTORY_PERIODS = 8;

export class DailyPlannerService {
  constructor(private readonly db: Database) {}

  async listPlanner(userId: string, query: PlannerRangeQuery) {
    const destination = alias(plannerEntries, "destination");
    const activeEntry = alias(plannerEntries, "active_entry");

    const entryRows = await this.db
      .select({
        entry: plannerEntries,
        task: tasks,
        movedToEntryId: destination.id,
        movedToPlannerDate: destination.plannerDate,
      })
      .from(plannerEntries)
      .innerJoin(
        tasks,
        and(
          eq(tasks.id, plannerEntries.taskId),
          eq(tasks.userId, plannerEntries.userId),
        ),
      )
      .leftJoin(
        destination,
        and(
          eq(destination.movedFromEntryId, plannerEntries.id),
          eq(destination.userId, plannerEntries.userId),
        ),
      )
      .where(
        and(
          eq(plannerEntries.userId, userId),
          between(plannerEntries.plannerDate, query.from, query.to),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(
        asc(plannerEntries.plannerDate),
        asc(plannerEntries.position),
        asc(plannerEntries.createdAt),
      );

    const inboxRows =
      query.inbox === "true"
        ? await this.db
            .select({ task: tasks })
            .from(tasks)
            .leftJoin(
              activeEntry,
              and(
                eq(activeEntry.taskId, tasks.id),
                eq(activeEntry.userId, tasks.userId),
                isNull(activeEntry.closedAt),
              ),
            )
            .where(
              and(
                eq(tasks.userId, userId),
                isNull(tasks.deletedAt),
                isNull(activeEntry.id),
              ),
            )
            .orderBy(desc(tasks.createdAt))
        : [];

    const taskIds = [
      ...new Set([
        ...entryRows.map(({ task }) => task.id),
        ...inboxRows.map(({ task }) => task.id),
      ]),
    ];
    const attachmentRows =
      taskIds.length > 0
        ? await this.db
            .select()
            .from(taskAttachments)
            .where(
              and(
                eq(taskAttachments.userId, userId),
                inArray(taskAttachments.taskId, taskIds),
                eq(taskAttachments.uploadStatus, "ready"),
                isNull(taskAttachments.deletedAt),
              ),
            )
            .orderBy(asc(taskAttachments.createdAt))
        : [];
    const attachmentsByTask = Map.groupBy(
      attachmentRows,
      (attachment) => attachment.taskId,
    );

    return {
      entries: entryRows.map(
        ({ entry, task, movedToEntryId, movedToPlannerDate }) => ({
          ...entry,
          movedToEntryId,
          movedToPlannerDate,
          task: {
            ...task,
            attachments: attachmentsByTask.get(task.id) ?? [],
          },
        }),
      ),
      inbox: inboxRows.map(({ task }) => ({
        ...task,
        attachments: attachmentsByTask.get(task.id) ?? [],
      })),
    };
  }

  async createTask(userId: string, input: CreateTaskInput) {
    return this.db.transaction(async (transaction) => {
      const profile = await transaction.query.profiles.findFirst({
        where: eq(profiles.id, userId),
      });
      if (!profile) throw new NotFoundError("User profile not found");

      if (input.plannerDate) {
        validateTimeBlock(
          input.plannerDate,
          profile.timeZone,
          input.startsAt,
          input.endsAt,
        );
      }

      const [task] = await transaction
        .insert(tasks)
        .values({
          userId,
          title: input.title,
          notes: input.notes,
          iconKey: input.iconKey,
          colorKey: input.colorKey,
        })
        .returning();

      let entry = null;
      if (input.plannerDate) {
        const position = await getNextPosition(
          transaction,
          userId,
          input.plannerDate,
        );
        [entry] = await transaction
          .insert(plannerEntries)
          .values({
            taskId: task.id,
            userId,
            plannerDate: input.plannerDate,
            position,
            startsAt: input.startsAt ? new Date(input.startsAt) : null,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            timeZone: profile.timeZone,
          })
          .returning();
      }

      return { task, entry };
    });
  }

  async updateTask(userId: string, taskId: string, input: UpdateTaskInput) {
    const [updated] = await this.db
      .update(tasks)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
        ...(input.colorKey !== undefined ? { colorKey: input.colorKey } : {}),
        version: sql`${tasks.version} + 1`,
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId),
          eq(tasks.version, input.expectedVersion),
          isNull(tasks.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      await this.throwNotFoundOrConflict(userId, taskId);
    }

    return updated;
  }

  async setCompletion(userId: string, taskId: string, input: CompletionInput) {
    const [updated] = await this.db
      .update(tasks)
      .set({
        completedAt: input.completed ? new Date() : null,
        version: sql`${tasks.version} + 1`,
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId),
          eq(tasks.version, input.expectedVersion),
          isNull(tasks.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      await this.throwNotFoundOrConflict(userId, taskId);
    }

    return updated;
  }

  async scheduleTask(userId: string, taskId: string, input: ScheduleTaskInput) {
    return this.db.transaction(async (transaction) => {
      const [task] = await transaction
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.userId, userId),
            isNull(tasks.deletedAt),
          ),
        )
        .for("update");

      if (!task) throw new NotFoundError();
      if (task.version !== input.expectedVersion) throw new ConflictError();

      const profile = await transaction.query.profiles.findFirst({
        where: eq(profiles.id, userId),
      });
      if (!profile) throw new NotFoundError("User profile not found");

      const [active] = await transaction
        .select()
        .from(plannerEntries)
        .where(
          and(
            eq(plannerEntries.taskId, taskId),
            eq(plannerEntries.userId, userId),
            isNull(plannerEntries.closedAt),
          ),
        )
        .for("update");

      let entry = null;
      if (!input.plannerDate) {
        if (active) {
          [entry] = await transaction
            .update(plannerEntries)
            .set({
              closedAt: new Date(),
              closureReason: "unscheduled",
            })
            .where(eq(plannerEntries.id, active.id))
            .returning();
        }
      } else {
        validateTimeBlock(
          input.plannerDate,
          profile.timeZone,
          input.startsAt,
          input.endsAt,
        );

        if (active?.plannerDate === input.plannerDate) {
          [entry] = await transaction
            .update(plannerEntries)
            .set({
              startsAt: input.startsAt ? new Date(input.startsAt) : null,
              endsAt: input.endsAt ? new Date(input.endsAt) : null,
              timeZone: profile.timeZone,
              ...(input.position ? { position: input.position } : {}),
            })
            .where(eq(plannerEntries.id, active.id))
            .returning();
        } else {
          if (active) {
            await transaction
              .update(plannerEntries)
              .set({
                closedAt: new Date(),
                closureReason: "moved",
              })
              .where(eq(plannerEntries.id, active.id));
          }

          const position =
            input.position ??
            (await getNextPosition(transaction, userId, input.plannerDate));
          [entry] = await transaction
            .insert(plannerEntries)
            .values({
              taskId,
              userId,
              plannerDate: input.plannerDate,
              position,
              startsAt: input.startsAt ? new Date(input.startsAt) : null,
              endsAt: input.endsAt ? new Date(input.endsAt) : null,
              timeZone: profile.timeZone,
              movedFromEntryId: active?.id,
            })
            .returning();
        }
      }

      const [updatedTask] = await transaction
        .update(tasks)
        .set({ version: sql`${tasks.version} + 1` })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.userId, userId),
            eq(tasks.version, input.expectedVersion),
          ),
        )
        .returning();

      if (!updatedTask) throw new ConflictError();
      return { task: updatedTask, entry };
    });
  }

  async reorderPlanner(userId: string, input: ReorderPlannerInput) {
    return this.db.transaction(async (transaction) => {
      const activeEntries = await transaction
        .select({ id: plannerEntries.id, position: plannerEntries.position })
        .from(plannerEntries)
        .where(
          and(
            eq(plannerEntries.userId, userId),
            eq(plannerEntries.plannerDate, input.plannerDate),
            isNull(plannerEntries.closedAt),
          ),
        )
        .for("update");

      const positionById = new Map(
        activeEntries.map(({ id, position }) => [id, position]),
      );
      const stale = input.orderedEntryIds.some((id) => !positionById.has(id));
      if (stale) {
        throw new ConflictError(
          "The planner day changed; refresh before reordering",
        );
      }

      // Reassign only the positions already held by the requested entries, so
      // an active entry left out of the request (added or moved after the
      // caller last fetched the day) keeps its position and can't collide
      // with one handed out here.
      const slots = input.orderedEntryIds
        .map((id) => positionById.get(id)!)
        .sort((a, b) => a - b);

      for (const [index, entryId] of input.orderedEntryIds.entries()) {
        await transaction
          .update(plannerEntries)
          .set({ position: slots[index] })
          .where(
            and(
              eq(plannerEntries.id, entryId),
              eq(plannerEntries.userId, userId),
              eq(plannerEntries.plannerDate, input.plannerDate),
              isNull(plannerEntries.closedAt),
            ),
          );
      }

      return { orderedEntryIds: input.orderedEntryIds };
    });
  }

  async deleteTask(userId: string, taskId: string, expectedVersion: number) {
    const [deleted] = await this.db
      .update(tasks)
      .set({
        deletedAt: new Date(),
        version: sql`${tasks.version} + 1`,
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId),
          eq(tasks.version, expectedVersion),
          isNull(tasks.deletedAt),
        ),
      )
      .returning();

    if (!deleted) {
      await this.throwNotFoundOrConflict(userId, taskId);
    }
    return deleted;
  }

  async restoreTask(userId: string, taskId: string, expectedVersion: number) {
    const cutoff = recoveryCutoff();
    const [restored] = await this.db
      .update(tasks)
      .set({
        deletedAt: null,
        version: sql`${tasks.version} + 1`,
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId),
          eq(tasks.version, expectedVersion),
          isNotNull(tasks.deletedAt),
          gte(tasks.deletedAt, cutoff),
        ),
      )
      .returning();

    if (!restored) {
      const task = await this.findOwnedTask(userId, taskId);
      if (
        !task ||
        !task.deletedAt ||
        task.deletedAt.getTime() < cutoff.getTime()
      ) {
        throw new NotFoundError();
      }
      throw new ConflictError();
    }
    return restored;
  }

  async reserveAttachment(
    userId: string,
    taskId: string,
    input: ReserveAttachmentInput,
  ) {
    const task = await this.findOwnedTask(userId, taskId);
    if (!task || task.deletedAt) throw new NotFoundError();

    const attachmentId = crypto.randomUUID();
    const storagePath = `${userId}/${taskId}/${attachmentId}`;
    const [attachment] = await this.db
      .insert(taskAttachments)
      .values({
        id: attachmentId,
        taskId,
        userId,
        storagePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
      })
      .returning();

    return attachment;
  }

  async confirmAttachment(
    userId: string,
    taskId: string,
    attachmentId: string,
    storage: AttachmentStorage,
  ) {
    await this.requireActiveTask(userId, taskId);
    const attachment = await this.findOwnedAttachment(
      userId,
      taskId,
      attachmentId,
    );
    if (!attachment || attachment.deletedAt) throw new NotFoundError();

    if (!(await storage.objectExists(attachment.storagePath))) {
      await this.db
        .update(taskAttachments)
        .set({ uploadStatus: "failed" })
        .where(eq(taskAttachments.id, attachment.id));
      throw new StorageError("The uploaded object could not be verified");
    }

    const [confirmed] = await this.db
      .update(taskAttachments)
      .set({ uploadStatus: "ready" })
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.userId, userId),
          eq(taskAttachments.taskId, taskId),
        ),
      )
      .returning();
    return confirmed;
  }

  async getAttachmentDownloadUrl(
    userId: string,
    taskId: string,
    attachmentId: string,
    storage: AttachmentStorage,
  ) {
    const attachment = await this.findOwnedAttachment(
      userId,
      taskId,
      attachmentId,
    );
    if (
      !attachment ||
      attachment.deletedAt ||
      attachment.uploadStatus !== "ready"
    ) {
      throw new NotFoundError();
    }

    return storage.createDownloadUrl(attachment.storagePath);
  }

  async retryAttachment(userId: string, taskId: string, attachmentId: string) {
    await this.requireActiveTask(userId, taskId);
    const [attachment] = await this.db
      .update(taskAttachments)
      .set({ uploadStatus: "pending" })
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.userId, userId),
          eq(taskAttachments.taskId, taskId),
          eq(taskAttachments.uploadStatus, "failed"),
          isNull(taskAttachments.deletedAt),
        ),
      )
      .returning();

    if (!attachment) throw new NotFoundError();
    return attachment;
  }

  async deleteAttachment(userId: string, taskId: string, attachmentId: string) {
    const [attachment] = await this.db
      .update(taskAttachments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.userId, userId),
          eq(taskAttachments.taskId, taskId),
          isNull(taskAttachments.deletedAt),
        ),
      )
      .returning();

    if (!attachment) throw new NotFoundError();
    return attachment;
  }

  async restoreAttachment(
    userId: string,
    taskId: string,
    attachmentId: string,
  ) {
    await this.requireActiveTask(userId, taskId);
    const cutoff = recoveryCutoff();
    const [attachment] = await this.db
      .update(taskAttachments)
      .set({ deletedAt: null })
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.userId, userId),
          eq(taskAttachments.taskId, taskId),
          isNotNull(taskAttachments.deletedAt),
          gte(taskAttachments.deletedAt, cutoff),
        ),
      )
      .returning();

    if (!attachment) throw new NotFoundError();
    return attachment;
  }

  async purgeExpired(storage: AttachmentStorage) {
    const recoveryCutoffDate = recoveryCutoff();
    const pendingCutoff = new Date(
      Date.now() - PENDING_UPLOAD_HOURS * 60 * 60 * 1000,
    );
    const candidates = await this.db
      .select({
        id: taskAttachments.id,
        storagePath: taskAttachments.storagePath,
      })
      .from(taskAttachments)
      .leftJoin(tasks, eq(tasks.id, taskAttachments.taskId))
      .where(
        or(
          and(
            isNotNull(taskAttachments.deletedAt),
            lt(taskAttachments.deletedAt, recoveryCutoffDate),
          ),
          and(
            eq(taskAttachments.uploadStatus, "pending"),
            lt(taskAttachments.createdAt, pendingCutoff),
          ),
          and(
            isNotNull(tasks.deletedAt),
            lt(tasks.deletedAt, recoveryCutoffDate),
          ),
        ),
      );

    if (candidates.length > 0) {
      await storage.remove(candidates.map(({ storagePath }) => storagePath));
    }

    const result = await this.db.transaction(async (transaction) => {
      const deletedAttachments =
        candidates.length > 0
          ? await transaction
              .delete(taskAttachments)
              .where(
                inArray(
                  taskAttachments.id,
                  candidates.map(({ id }) => id),
                ),
              )
              .returning({ id: taskAttachments.id })
          : [];
      const deletedTasks = await transaction
        .delete(tasks)
        .where(
          and(
            isNotNull(tasks.deletedAt),
            lt(tasks.deletedAt, recoveryCutoffDate),
          ),
        )
        .returning({ id: tasks.id });

      return {
        attachments: deletedAttachments.length,
        tasks: deletedTasks.length,
      };
    });

    return result;
  }

  async listMetrics(userId: string, query: MetricsQuery) {
    const profile = await this.db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
    });
    if (!profile) throw new NotFoundError("User profile not found");
    // Rejects an unusable stored zone before Postgres raises a raw error.
    calendarDateInTimeZone(new Date(), profile.timeZone);

    const metricRows = await this.db
      .select()
      .from(metrics)
      .where(and(eq(metrics.userId, userId), isNull(metrics.archivedAt)))
      .orderBy(asc(metrics.createdAt), asc(metrics.id));

    const statRows = await this.db.execute<MetricStatsRow>(
      metricStatsQuery(userId, profile.timeZone, query.anchor),
    );
    const statsByMetric = new Map(statRows.map((row) => [row.metricId, row]));

    return {
      anchor: query.anchor,
      metrics: metricRows.map((metric) => {
        const stats = statsByMetric.get(metric.id);
        return {
          ...metric,
          periodStart: stats?.periodStart ?? query.anchor,
          periodEnd: stats?.periodEnd ?? query.anchor,
          currentCount: stats?.currentCount ?? 0,
          history: stats?.history ?? [],
          days: stats?.days ?? [],
        };
      }),
    };
  }

  async createMetric(userId: string, input: CreateMetricInput) {
    const profile = await this.db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
    });
    if (!profile) throw new NotFoundError("User profile not found");

    const [metric] = await this.db
      .insert(metrics)
      .values({
        userId,
        name: input.name,
        keywords: input.keywords,
        targetCount: input.targetCount,
        period: input.period,
        endsOn: input.endsOn ?? null,
      })
      .returning();

    return metric;
  }

  async updateMetric(
    userId: string,
    metricId: string,
    input: UpdateMetricInput,
  ) {
    const [updated] = await this.db
      .update(metrics)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
        ...(input.targetCount !== undefined
          ? { targetCount: input.targetCount }
          : {}),
        ...(input.period !== undefined ? { period: input.period } : {}),
        ...(input.endsOn !== undefined ? { endsOn: input.endsOn } : {}),
      })
      .where(
        and(
          eq(metrics.id, metricId),
          eq(metrics.userId, userId),
          isNull(metrics.archivedAt),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundError();
    return updated;
  }

  async archiveMetric(userId: string, metricId: string) {
    const [archived] = await this.db
      .update(metrics)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(metrics.id, metricId),
          eq(metrics.userId, userId),
          isNull(metrics.archivedAt),
        ),
      )
      .returning();

    if (!archived) throw new NotFoundError();
    return archived;
  }

  async setMetricLink(
    userId: string,
    taskId: string,
    input: SetMetricLinkInput,
  ) {
    await this.requireActiveTask(userId, taskId);
    await this.requireActiveMetric(userId, input.metricId);

    if (input.state === "clear") {
      await this.db
        .delete(taskMetricLinks)
        .where(
          and(
            eq(taskMetricLinks.taskId, taskId),
            eq(taskMetricLinks.metricId, input.metricId),
            eq(taskMetricLinks.userId, userId),
          ),
        );
      return { link: null };
    }

    const [link] = await this.db
      .insert(taskMetricLinks)
      .values({
        taskId,
        metricId: input.metricId,
        userId,
        state: input.state,
      })
      .onConflictDoUpdate({
        target: [taskMetricLinks.taskId, taskMetricLinks.metricId],
        set: { state: input.state },
      })
      .returning();

    return { link };
  }

  private async findOwnedTask(userId: string, taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);
    return task;
  }

  private async requireActiveTask(userId: string, taskId: string) {
    const task = await this.findOwnedTask(userId, taskId);
    if (!task || task.deletedAt) throw new NotFoundError();
    return task;
  }

  private async requireActiveMetric(userId: string, metricId: string) {
    const [metric] = await this.db
      .select()
      .from(metrics)
      .where(
        and(
          eq(metrics.id, metricId),
          eq(metrics.userId, userId),
          isNull(metrics.archivedAt),
        ),
      )
      .limit(1);

    if (!metric) throw new NotFoundError();
    return metric;
  }

  private async findOwnedAttachment(
    userId: string,
    taskId: string,
    attachmentId: string,
  ) {
    const [attachment] = await this.db
      .select()
      .from(taskAttachments)
      .where(
        and(
          eq(taskAttachments.id, attachmentId),
          eq(taskAttachments.taskId, taskId),
          eq(taskAttachments.userId, userId),
        ),
      )
      .limit(1);
    return attachment;
  }

  private async throwNotFoundOrConflict(
    userId: string,
    taskId: string,
    includeDeleted = false,
  ): Promise<never> {
    const task = await this.findOwnedTask(userId, taskId);
    if (!task || (!includeDeleted && task.deletedAt)) {
      throw new NotFoundError();
    }
    throw new ConflictError();
  }
}

type MetricPeriodStat = {
  periodStart: string;
  periodEnd: string;
  count: number;
};

type MetricDayStat = {
  date: string;
  hit: boolean;
};

type MetricStatsRow = {
  metricId: string;
  periodStart: string;
  periodEnd: string;
  currentCount: number;
  history: MetricPeriodStat[];
  days: MetricDayStat[];
};

/**
 * Counts matching tasks per metric for the anchor period and the periods
 * before it. Period boundaries are calendar maths in the profile time zone;
 * weeks start on Sunday. A task is attributed to its active planner entry's
 * date, falling back to the local calendar date of `completed_at`.
 */
function metricStatsQuery(userId: string, timeZone: string, anchor: string) {
  return sql`
    with metric_rows as (
      select id, period, keywords
      from ${metrics}
      where user_id = ${userId}::uuid
        and archived_at is null
    ),
    bounds as (
      select
        m.id as metric_id,
        m.period,
        m.keywords,
        case m.period
          when 'day' then ${anchor}::date
          when 'week' then ${anchor}::date - extract(dow from ${anchor}::date)::int
          else date_trunc('month', ${anchor}::date)::date
        end as current_start
      from metric_rows m
    ),
    period_starts as (
      select
        b.metric_id,
        b.period,
        series.n as period_offset,
        case b.period
          when 'day' then b.current_start - series.n
          when 'week' then b.current_start - (series.n * 7)
          else (b.current_start - (series.n * interval '1 month'))::date
        end as period_start
      from bounds b
      cross join generate_series(
        0,
        ${METRIC_HISTORY_PERIODS - 1}::integer
      ) as series(n)
    ),
    period_ranges as (
      select
        p.metric_id,
        p.period_offset,
        p.period_start,
        case p.period
          when 'day' then p.period_start
          when 'week' then p.period_start + 6
          else (p.period_start + interval '1 month' - interval '1 day')::date
        end as period_end
      from period_starts p
    ),
    window_bounds as (
      select min(period_start) as from_date, max(period_end) as to_date
      from period_ranges
    ),
    attributed as (
      select
        t.id as task_id,
        t.title_normalized,
        coalesce(
          entry.planner_date,
          timezone(${timeZone}::text, t.completed_at)::date
        ) as attributed_date
      from ${tasks} t
      left join ${plannerEntries} entry
        on entry.task_id = t.id
        and entry.user_id = t.user_id
        and entry.closed_at is null
      where t.user_id = ${userId}::uuid
        and t.deleted_at is null
        and t.completed_at is not null
    ),
    in_window as (
      select a.*
      from attributed a
      cross join window_bounds w
      where a.attributed_date between w.from_date and w.to_date
    ),
    matches as (
      select b.metric_id, a.task_id, a.attributed_date
      from bounds b
      cross join in_window a
      left join ${taskMetricLinks} link
        on link.metric_id = b.metric_id
        and link.task_id = a.task_id
      where link.state is distinct from 'excluded'
        and (
          link.state = 'included'
          or exists (
            select 1
            from unnest(b.keywords) as keyword
            where extensions.word_similarity(keyword, a.title_normalized)
              >= ${METRIC_MATCH_THRESHOLD}::real
          )
        )
    ),
    period_counts as (
      select
        r.metric_id,
        r.period_offset,
        r.period_start,
        r.period_end,
        (
          select count(*)::integer
          from matches m
          where m.metric_id = r.metric_id
            and m.attributed_date between r.period_start and r.period_end
        ) as count
      from period_ranges r
    ),
    current_days as (
      select
        r.metric_id,
        series.day::date as day,
        exists (
          select 1
          from matches m
          where m.metric_id = r.metric_id
            and m.attributed_date = series.day::date
        ) as hit
      from period_ranges r
      cross join lateral generate_series(
        r.period_start::timestamp,
        r.period_end::timestamp,
        interval '1 day'
      ) as series(day)
      where r.period_offset = 0
    )
    select
      b.metric_id as "metricId",
      (
        select pc.period_start::text
        from period_counts pc
        where pc.metric_id = b.metric_id and pc.period_offset = 0
      ) as "periodStart",
      (
        select pc.period_end::text
        from period_counts pc
        where pc.metric_id = b.metric_id and pc.period_offset = 0
      ) as "periodEnd",
      (
        select pc.count
        from period_counts pc
        where pc.metric_id = b.metric_id and pc.period_offset = 0
      ) as "currentCount",
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'periodStart', pc.period_start::text,
              'periodEnd', pc.period_end::text,
              'count', pc.count
            )
            order by pc.period_offset desc
          )
          from period_counts pc
          where pc.metric_id = b.metric_id
        ),
        '[]'::jsonb
      ) as history,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('date', cd.day::text, 'hit', cd.hit)
            order by cd.day
          )
          from current_days cd
          where cd.metric_id = b.metric_id
        ),
        '[]'::jsonb
      ) as days
    from bounds b
  `;
}

type QueryExecutor = Pick<Database, "select">;

async function getNextPosition(
  executor: QueryExecutor,
  userId: string,
  plannerDate: string,
) {
  const [result] = await executor
    .select({ position: max(plannerEntries.position) })
    .from(plannerEntries)
    .where(
      and(
        eq(plannerEntries.userId, userId),
        eq(plannerEntries.plannerDate, plannerDate),
        isNull(plannerEntries.closedAt),
      ),
    );

  return (result.position ?? 0) + POSITION_STEP;
}

function recoveryCutoff() {
  return new Date(Date.now() - RECOVERY_DAYS * 24 * 60 * 60 * 1000);
}
