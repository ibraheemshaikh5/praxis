import {
  and,
  asc,
  between,
  desc,
  eq,
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
  plannerEntries,
  profiles,
  taskAttachments,
  tasks,
} from "@/lib/db/schema";

import type {
  CompletionInput,
  CreateTaskInput,
  PlannerRangeQuery,
  ReorderPlannerInput,
  ReserveAttachmentInput,
  ScheduleTaskInput,
  UpdateTaskInput,
} from "./contracts";
import { ConflictError, NotFoundError, StorageError } from "./errors";
import type { AttachmentStorage } from "./storage";
import { validateTimeBlock } from "./time";

const POSITION_STEP = 1024;
const RECOVERY_DAYS = 30;
const PENDING_UPLOAD_HOURS = 24;

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
        .select({ id: plannerEntries.id })
        .from(plannerEntries)
        .where(
          and(
            eq(plannerEntries.userId, userId),
            eq(plannerEntries.plannerDate, input.plannerDate),
            isNull(plannerEntries.closedAt),
          ),
        )
        .for("update");

      const actual = activeEntries.map(({ id }) => id).sort();
      const requested = [...input.orderedEntryIds].sort();
      if (
        actual.length !== requested.length ||
        actual.some((id, index) => id !== requested[index])
      ) {
        throw new ConflictError(
          "The planner day changed; refresh before reordering",
        );
      }

      for (const [index, entryId] of input.orderedEntryIds.entries()) {
        await transaction
          .update(plannerEntries)
          .set({ position: (index + 1) * POSITION_STEP })
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
          sql`${tasks.deletedAt} >= ${cutoff}`,
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
          sql`${taskAttachments.deletedAt} >= ${cutoff}`,
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
