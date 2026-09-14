import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/daily-planner/errors";
import { calendarDateInTimeZone } from "@/lib/daily-planner/time";
import type { Database } from "@/lib/db/client";
import {
  courseAssignments,
  courseExams,
  courseTasks,
  courses,
  plannerEntries,
  profiles,
  tasks,
  type Course,
  type CourseAssignment,
  type CourseExam,
} from "@/lib/db/schema";

import {
  termRangeIssue,
  type CreateAssignmentInput,
  type CreateCourseInput,
  type CreateExamInput,
  type UpdateAssignmentInput,
  type UpdateCourseInput,
  type UpdateExamInput,
} from "./contracts";
import {
  assignmentOccurrences,
  examOccurrences,
  type Occurrence,
} from "./schedule";

const POSITION_STEP = 1024;
/** Generated tasks carry the class colour and read as course work. */
const COURSE_TASK_ICON = "book";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Source = { exam: CourseExam } | { assignment: CourseAssignment };

export type CourseDetail = Course & {
  exams: CourseExam[];
  assignments: CourseAssignment[];
};

export class CoursesService {
  constructor(private readonly db: Database) {}

  async listCourses(userId: string): Promise<CourseDetail[]> {
    const [rows, exams, assignments] = await Promise.all([
      this.db
        .select()
        .from(courses)
        .where(eq(courses.userId, userId))
        .orderBy(desc(courses.startsOn), asc(courses.name)),
      this.db
        .select()
        .from(courseExams)
        .where(eq(courseExams.userId, userId))
        .orderBy(asc(courseExams.examOn), asc(courseExams.createdAt)),
      this.db
        .select()
        .from(courseAssignments)
        .where(eq(courseAssignments.userId, userId))
        .orderBy(asc(courseAssignments.createdAt)),
    ]);

    const examsByCourse = Map.groupBy(exams, (exam) => exam.courseId);
    const assignmentsByCourse = Map.groupBy(
      assignments,
      (assignment) => assignment.courseId,
    );

    return rows.map((course) => ({
      ...course,
      exams: examsByCourse.get(course.id) ?? [],
      assignments: assignmentsByCourse.get(course.id) ?? [],
    }));
  }

  async getCourse(userId: string, courseId: string): Promise<CourseDetail> {
    const course = await this.requireCourse(this.db, userId, courseId);
    return this.withSources(this.db, course);
  }

  async createCourse(
    userId: string,
    input: CreateCourseInput,
  ): Promise<CourseDetail> {
    await this.requireProfile(this.db, userId);

    const [course] = await this.db
      .insert(courses)
      .values({
        userId,
        name: input.name,
        term: input.term,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        colorKey: input.colorKey,
        notes: input.notes ?? null,
      })
      .returning();

    return { ...course, exams: [], assignments: [] };
  }

  /**
   * A new name, colour, or term reaches every task the course has written, so
   * the change is followed by a pass over each exam and assignment.
   */
  async updateCourse(
    userId: string,
    courseId: string,
    input: UpdateCourseInput,
  ): Promise<CourseDetail> {
    return this.db.transaction(async (transaction) => {
      const current = await this.lockCourse(transaction, userId, courseId);
      if (current.version !== input.expectedVersion) {
        throw new ConflictError(
          "That class changed somewhere else. Reload and try again.",
        );
      }

      const { expectedVersion, ...fields } = input;
      const startsOn = fields.startsOn ?? current.startsOn;
      const endsOn = fields.endsOn ?? current.endsOn;
      const rangeIssue = termRangeIssue(startsOn, endsOn);
      if (rangeIssue) throw new ValidationError(rangeIssue);

      const [updated] = await transaction
        .update(courses)
        .set(fields)
        .where(
          and(
            eq(courses.id, courseId),
            eq(courses.userId, userId),
            eq(courses.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated) throw new ConflictError();

      const affectsTasks =
        updated.name !== current.name ||
        updated.colorKey !== current.colorKey ||
        updated.startsOn !== current.startsOn ||
        updated.endsOn !== current.endsOn;

      const detail = await this.withSources(transaction, updated);
      if (affectsTasks) {
        const timeZone = await this.requireProfile(transaction, userId);
        for (const exam of detail.exams) {
          await this.reconcile(transaction, detail, { exam }, timeZone);
        }
        for (const assignment of detail.assignments) {
          await this.reconcile(transaction, detail, { assignment }, timeZone);
        }
      }

      return detail;
    });
  }

  /**
   * Removing a class takes its upcoming planner tasks with it. Done and past
   * tasks stay, because they record work that happened.
   */
  async deleteCourse(userId: string, courseId: string) {
    return this.db.transaction(async (transaction) => {
      const course = await this.lockCourse(transaction, userId, courseId);
      const timeZone = await this.requireProfile(transaction, userId);
      const detail = await this.withSources(transaction, course);

      for (const exam of detail.exams) {
        await this.reconcile(transaction, detail, { exam }, timeZone, []);
      }
      for (const assignment of detail.assignments) {
        await this.reconcile(transaction, detail, { assignment }, timeZone, []);
      }

      const [deleted] = await transaction
        .delete(courses)
        .where(and(eq(courses.id, courseId), eq(courses.userId, userId)))
        .returning();
      if (!deleted) throw new NotFoundError();
      return deleted;
    });
  }

  async createExam(userId: string, courseId: string, input: CreateExamInput) {
    return this.db.transaction(async (transaction) => {
      const course = await this.lockCourse(transaction, userId, courseId);
      const timeZone = await this.requireProfile(transaction, userId);

      const [exam] = await transaction
        .insert(courseExams)
        .values({
          userId,
          courseId,
          title: input.title,
          examOn: input.examOn,
          examTime: input.examTime ?? null,
          reminderDays: input.reminderDays,
          notes: input.notes ?? null,
        })
        .returning();

      await this.reconcile(transaction, course, { exam }, timeZone);
      return exam;
    });
  }

  async updateExam(
    userId: string,
    courseId: string,
    examId: string,
    input: UpdateExamInput,
  ) {
    return this.db.transaction(async (transaction) => {
      const course = await this.lockCourse(transaction, userId, courseId);
      const timeZone = await this.requireProfile(transaction, userId);

      const [exam] = await transaction
        .update(courseExams)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.examOn !== undefined ? { examOn: input.examOn } : {}),
          ...(input.examTime !== undefined ? { examTime: input.examTime } : {}),
          ...(input.reminderDays !== undefined
            ? { reminderDays: input.reminderDays }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .where(
          and(
            eq(courseExams.id, examId),
            eq(courseExams.courseId, courseId),
            eq(courseExams.userId, userId),
          ),
        )
        .returning();
      if (!exam) throw new NotFoundError();

      await this.reconcile(transaction, course, { exam }, timeZone);
      return exam;
    });
  }

  async deleteExam(userId: string, courseId: string, examId: string) {
    return this.db.transaction(async (transaction) => {
      const course = await this.lockCourse(transaction, userId, courseId);
      const timeZone = await this.requireProfile(transaction, userId);

      const [exam] = await transaction
        .select()
        .from(courseExams)
        .where(
          and(
            eq(courseExams.id, examId),
            eq(courseExams.courseId, courseId),
            eq(courseExams.userId, userId),
          ),
        );
      if (!exam) throw new NotFoundError();

      await this.reconcile(transaction, course, { exam }, timeZone, []);
      await transaction.delete(courseExams).where(eq(courseExams.id, exam.id));
      return exam;
    });
  }

  async createAssignment(
    userId: string,
    courseId: string,
    input: CreateAssignmentInput,
  ) {
    return this.db.transaction(async (transaction) => {
      const course = await this.lockCourse(transaction, userId, courseId);
      const timeZone = await this.requireProfile(transaction, userId);

      const [assignment] = await transaction
        .insert(courseAssignments)
        .values({
          userId,
          courseId,
          title: input.title,
          weekdays: input.weekdays,
          dueTime: input.dueTime ?? null,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      await this.reconcile(transaction, course, { assignment }, timeZone);
      return assignment;
    });
  }

  async updateAssignment(
    userId: string,
    courseId: string,
    assignmentId: string,
    input: UpdateAssignmentInput,
  ) {
    return this.db.transaction(async (transaction) => {
      const course = await this.lockCourse(transaction, userId, courseId);
      const timeZone = await this.requireProfile(transaction, userId);

      const [assignment] = await transaction
        .update(courseAssignments)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.weekdays !== undefined ? { weekdays: input.weekdays } : {}),
          ...(input.dueTime !== undefined ? { dueTime: input.dueTime } : {}),
          ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
          ...(input.endsOn !== undefined ? { endsOn: input.endsOn } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .where(
          and(
            eq(courseAssignments.id, assignmentId),
            eq(courseAssignments.courseId, courseId),
            eq(courseAssignments.userId, userId),
          ),
        )
        .returning();
      if (!assignment) throw new NotFoundError();

      await this.reconcile(transaction, course, { assignment }, timeZone);
      return assignment;
    });
  }

  async deleteAssignment(
    userId: string,
    courseId: string,
    assignmentId: string,
  ) {
    return this.db.transaction(async (transaction) => {
      const course = await this.lockCourse(transaction, userId, courseId);
      const timeZone = await this.requireProfile(transaction, userId);

      const [assignment] = await transaction
        .select()
        .from(courseAssignments)
        .where(
          and(
            eq(courseAssignments.id, assignmentId),
            eq(courseAssignments.courseId, courseId),
            eq(courseAssignments.userId, userId),
          ),
        );
      if (!assignment) throw new NotFoundError();

      await this.reconcile(transaction, course, { assignment }, timeZone, []);
      await transaction
        .delete(courseAssignments)
        .where(eq(courseAssignments.id, assignment.id));
      return assignment;
    });
  }

  /**
   * Brings the planner in line with what a source now says, touching only
   * dates from today on. A task the rule no longer wants is soft-deleted the
   * way a planner delete is, unless it was already done; one it still wants
   * is retitled in place; a date it newly wants gets a fresh task. A task the
   * owner removed themselves keeps its link, so it is not written back.
   */
  private async reconcile(
    transaction: Transaction,
    course: Course,
    source: Source,
    timeZone: string,
    desiredOverride?: Occurrence[],
  ) {
    const today = calendarDateInTimeZone(new Date(), timeZone);
    const desired =
      desiredOverride ??
      ("exam" in source
        ? examOccurrences(course, source.exam, today, timeZone)
        : assignmentOccurrences(course, source.assignment, today, timeZone));

    const sourceFilter =
      "exam" in source
        ? eq(courseTasks.examId, source.exam.id)
        : eq(courseTasks.assignmentId, source.assignment.id);
    const activeEntry = alias(plannerEntries, "active_entry");

    const links = await transaction
      .select({ link: courseTasks, task: tasks, entry: activeEntry })
      .from(courseTasks)
      .innerJoin(
        tasks,
        and(
          eq(tasks.id, courseTasks.taskId),
          eq(tasks.userId, courseTasks.userId),
        ),
      )
      .leftJoin(
        activeEntry,
        and(
          eq(activeEntry.taskId, tasks.id),
          eq(activeEntry.userId, tasks.userId),
          isNull(activeEntry.closedAt),
        ),
      )
      .where(and(eq(courseTasks.userId, course.userId), sourceFilter));

    const wanted = new Map(desired.map((item) => [item.occursOn, item]));
    const retire: string[] = [];

    for (const { link, task, entry } of links) {
      if (link.occursOn < today) continue;

      const occurrence = wanted.get(link.occursOn);
      if (!occurrence) {
        if (!task.deletedAt && !task.completedAt) retire.push(task.id);
        await transaction
          .delete(courseTasks)
          .where(eq(courseTasks.taskId, task.id));
        continue;
      }

      wanted.delete(link.occursOn);
      if (task.deletedAt) continue;

      if (
        task.title !== occurrence.title ||
        (task.notes ?? null) !== occurrence.notes ||
        task.colorKey !== course.colorKey
      ) {
        await transaction
          .update(tasks)
          .set({
            title: occurrence.title,
            notes: occurrence.notes,
            colorKey: course.colorKey,
            version: sql`${tasks.version} + 1`,
          })
          .where(eq(tasks.id, task.id));
      }

      // A time block follows the rule only while the task still sits on the
      // day the rule put it; a task the owner moved keeps their choice.
      if (entry && entry.plannerDate === occurrence.occursOn) {
        const currentStart = entry.startsAt?.toISOString() ?? null;
        if (currentStart !== occurrence.startsAt) {
          await transaction
            .update(plannerEntries)
            .set({
              startsAt: occurrence.startsAt
                ? new Date(occurrence.startsAt)
                : null,
              endsAt: null,
              timeZone,
            })
            .where(eq(plannerEntries.id, entry.id));
        }
      }
    }

    if (retire.length > 0) {
      await transaction
        .update(tasks)
        .set({ deletedAt: new Date(), version: sql`${tasks.version} + 1` })
        .where(and(inArray(tasks.id, retire), isNull(tasks.deletedAt)));
    }

    for (const occurrence of wanted.values()) {
      const [task] = await transaction
        .insert(tasks)
        .values({
          userId: course.userId,
          title: occurrence.title,
          notes: occurrence.notes,
          iconKey: COURSE_TASK_ICON,
          colorKey: course.colorKey,
        })
        .returning();

      const position = await nextPosition(
        transaction,
        course.userId,
        occurrence.occursOn,
      );
      await transaction.insert(plannerEntries).values({
        taskId: task.id,
        userId: course.userId,
        plannerDate: occurrence.occursOn,
        position,
        startsAt: occurrence.startsAt ? new Date(occurrence.startsAt) : null,
        endsAt: null,
        timeZone,
      });

      await transaction.insert(courseTasks).values({
        taskId: task.id,
        userId: course.userId,
        courseId: course.id,
        examId: "exam" in source ? source.exam.id : null,
        assignmentId: "assignment" in source ? source.assignment.id : null,
        occursOn: occurrence.occursOn,
      });
    }
  }

  private async withSources<T extends Course>(
    executor: Pick<Database, "select">,
    course: T,
  ): Promise<T & { exams: CourseExam[]; assignments: CourseAssignment[] }> {
    const [exams, assignments] = await Promise.all([
      executor
        .select()
        .from(courseExams)
        .where(
          and(
            eq(courseExams.userId, course.userId),
            eq(courseExams.courseId, course.id),
          ),
        )
        .orderBy(asc(courseExams.examOn), asc(courseExams.createdAt)),
      executor
        .select()
        .from(courseAssignments)
        .where(
          and(
            eq(courseAssignments.userId, course.userId),
            eq(courseAssignments.courseId, course.id),
          ),
        )
        .orderBy(asc(courseAssignments.createdAt)),
    ]);

    return { ...course, exams, assignments };
  }

  private async requireCourse(
    executor: Pick<Database, "select">,
    userId: string,
    courseId: string,
  ) {
    const [course] = await executor
      .select()
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));
    if (!course) throw new NotFoundError();
    return course;
  }

  /** Every write that touches a course's tasks runs one at a time per course. */
  private async lockCourse(
    transaction: Transaction,
    userId: string,
    courseId: string,
  ) {
    const [course] = await transaction
      .select()
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.userId, userId)))
      .for("update");
    if (!course) throw new NotFoundError();
    return course;
  }

  private async requireProfile(
    executor: Pick<Database, "select">,
    userId: string,
  ) {
    const [profile] = await executor
      .select({ timeZone: profiles.timeZone })
      .from(profiles)
      .where(eq(profiles.id, userId));
    if (!profile) throw new NotFoundError("User profile not found");
    return profile.timeZone;
  }
}

async function nextPosition(
  executor: Pick<Database, "select">,
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
