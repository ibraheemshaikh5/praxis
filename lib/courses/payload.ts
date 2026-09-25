import type {
  CourseAssignmentPayload,
  CourseExamPayload,
  CoursePayload,
} from "@/lib/api/types";
import type { TaskColorKey } from "@/lib/daily-planner/appearance";
import type { Course, CourseAssignment, CourseExam } from "@/lib/db/schema";

import type { CourseDetail } from "./service";

/** Postgres hands a `time` back as HH:MM:SS; the interface speaks HH:MM. */
function toTimeOfDay(value: string | null) {
  return value ? value.slice(0, 5) : null;
}

/**
 * Route handlers serialize timestamps on the way out; a server component hands
 * the row to the client directly, so it converts them here instead.
 */
export function toCoursePayload(course: CourseDetail): CoursePayload {
  return {
    ...toBareCourse(course),
    exams: course.exams.map(toCourseExamPayload),
    assignments: course.assignments.map(toCourseAssignmentPayload),
  };
}

export function toBareCourse(course: Course) {
  return {
    id: course.id,
    userId: course.userId,
    name: course.name,
    term: course.term,
    startsOn: course.startsOn,
    endsOn: course.endsOn,
    colorKey: course.colorKey as TaskColorKey,
    notes: course.notes,
    version: course.version,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

export function toCourseExamPayload(exam: CourseExam): CourseExamPayload {
  return {
    ...exam,
    examTime: toTimeOfDay(exam.examTime),
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
  };
}

export function toCourseAssignmentPayload(
  assignment: CourseAssignment,
): CourseAssignmentPayload {
  return {
    ...assignment,
    dueTime: toTimeOfDay(assignment.dueTime),
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}
