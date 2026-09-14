"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { plannerKeys } from "@/hooks/use-planner";
import {
  ApiError,
  createCourse,
  createCourseAssignment,
  createCourseExam,
  deleteCourse,
  deleteCourseAssignment,
  deleteCourseExam,
  fetchCourse,
  fetchCourses,
  updateCourse,
  updateCourseAssignment,
  updateCourseExam,
} from "@/lib/api/client";
import { applyOptimistically } from "@/lib/api/optimistic";
import type {
  CourseAssignmentPayload,
  CourseExamPayload,
  CoursePayload,
  CourseResponse,
  CoursesResponse,
  CreateCourseAssignmentBody,
  CreateCourseBody,
  CreateCourseExamBody,
  UpdateCourseAssignmentBody,
  UpdateCourseBody,
  UpdateCourseExamBody,
} from "@/lib/api/types";
import { DEFAULT_REMINDER_DAYS } from "@/lib/courses/schedule";

export const coursesKeys = {
  all: ["courses"] as const,
  list: ["courses", "list"] as const,
  course: (courseId: string) => ["courses", "course", courseId] as const,
};

function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }

  toast.error(fallback);
}

/** Every write here rewrites planner tasks, so the planner refetches too. */
function invalidateCourses(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: coursesKeys.all }),
    client.invalidateQueries({ queryKey: plannerKeys.all }),
  ]);
}

function sortExams(exams: CourseExamPayload[]) {
  return [...exams].sort(
    (a, b) =>
      a.examOn.localeCompare(b.examOn) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

function editCourse(
  client: QueryClient,
  courseId: string,
  edit: (course: CoursePayload) => CoursePayload,
) {
  client.setQueryData<CourseResponse>(
    coursesKeys.course(courseId),
    (current) => (current ? { course: edit(current.course) } : current),
  );
  client.setQueryData<CoursesResponse>(coursesKeys.list, (current) =>
    current
      ? {
          courses: current.courses.map((course) =>
            course.id === courseId ? edit(course) : course,
          ),
        }
      : current,
  );
}

export function useCourses() {
  return useQuery({
    queryKey: coursesKeys.list,
    queryFn: () => fetchCourses(),
    staleTime: 15_000,
  });
}

export function useCourse(courseId: string, initialCourse: CoursePayload) {
  return useQuery({
    queryKey: coursesKeys.course(courseId),
    queryFn: () => fetchCourse(courseId),
    initialData: { course: initialCourse } satisfies CourseResponse,
    staleTime: 15_000,
  });
}

export function useCreateCourse() {
  const client = useQueryClient();

  return useMutation({
    // The page moves to the new class once it has an id, so the dialog shows
    // the pending state rather than a row that is not there yet.
    mutationFn: (body: CreateCourseBody) => createCourse(body),
    onSuccess: (result) => {
      client.setQueryData<CourseResponse>(
        coursesKeys.course(result.course.id),
        result,
      );
    },
    onError: (error) => reportError(error, "Could not add that class."),
    onSettled: () => invalidateCourses(client),
  });
}

export function useUpdateCourse() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { courseId: string; body: UpdateCourseBody }) =>
      updateCourse(input.courseId, input.body),
    async onMutate(input) {
      const { expectedVersion, ...fields } = input.body;
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.course(input.courseId), coursesKeys.list],
        () => {
          editCourse(client, input.courseId, (course) => ({
            ...course,
            ...fields,
            version: expectedVersion + 1,
          }));
        },
      );
      return { rollback };
    },
    // The write bumps the version, and the next edit has to send the new one.
    onSuccess: (result) => {
      client.setQueryData<CourseResponse>(
        coursesKeys.course(result.course.id),
        result,
      );
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not save that class.");
    },
    onSettled: () => invalidateCourses(client),
  });
}

export function useDeleteCourse() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (courseId: string) => deleteCourse(courseId),
    async onMutate(courseId) {
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.list],
        () => {
          client.setQueryData<CoursesResponse>(coursesKeys.list, (current) =>
            current
              ? {
                  courses: current.courses.filter(
                    (course) => course.id !== courseId,
                  ),
                }
              : current,
          );
        },
      );
      return { rollback };
    },
    onSuccess: (result) => {
      // The detail page is still mounted while it navigates away; dropping
      // the query keeps it from refetching a row that is gone.
      client.removeQueries({ queryKey: coursesKeys.course(result.course.id) });
      toast.success(`Removed ${result.course.name}.`);
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not remove that class.");
    },
    onSettled: () => invalidateCourses(client),
  });
}

export function useCreateExam(courseId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCourseExamBody) =>
      createCourseExam(courseId, body),
    async onMutate(body) {
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.course(courseId), coursesKeys.list],
        () => {
          const now = new Date().toISOString();
          editCourse(client, courseId, (course) => ({
            ...course,
            exams: sortExams([
              ...course.exams,
              {
                // A provisional row; the refetch replaces it with the stored one.
                id: crypto.randomUUID(),
                courseId,
                userId: course.userId,
                title: body.title,
                examOn: body.examOn,
                examTime: body.examTime ?? null,
                reminderDays: body.reminderDays ?? DEFAULT_REMINDER_DAYS,
                notes: body.notes ?? null,
                createdAt: now,
                updatedAt: now,
              },
            ]),
          }));
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not add that exam.");
    },
    onSettled: () => invalidateCourses(client),
  });
}

export function useUpdateExam(courseId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { examId: string; body: UpdateCourseExamBody }) =>
      updateCourseExam(courseId, input.examId, input.body),
    async onMutate(input) {
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.course(courseId), coursesKeys.list],
        () => {
          editCourse(client, courseId, (course) => ({
            ...course,
            exams: sortExams(
              course.exams.map((exam) =>
                exam.id === input.examId
                  ? {
                      ...exam,
                      ...input.body,
                      updatedAt: new Date().toISOString(),
                    }
                  : exam,
              ),
            ),
          }));
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not save that exam.");
    },
    onSettled: () => invalidateCourses(client),
  });
}

export function useDeleteExam(courseId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (examId: string) => deleteCourseExam(courseId, examId),
    async onMutate(examId) {
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.course(courseId), coursesKeys.list],
        () => {
          editCourse(client, courseId, (course) => ({
            ...course,
            exams: course.exams.filter((exam) => exam.id !== examId),
          }));
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not remove that exam.");
    },
    onSettled: () => invalidateCourses(client),
  });
}

export function useCreateAssignment(courseId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCourseAssignmentBody) =>
      createCourseAssignment(courseId, body),
    async onMutate(body) {
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.course(courseId), coursesKeys.list],
        () => {
          const now = new Date().toISOString();
          editCourse(client, courseId, (course) => ({
            ...course,
            assignments: [
              ...course.assignments,
              {
                id: crypto.randomUUID(),
                courseId,
                userId: course.userId,
                title: body.title,
                weekdays: body.weekdays,
                dueTime: body.dueTime ?? null,
                startsOn: body.startsOn ?? null,
                endsOn: body.endsOn ?? null,
                notes: body.notes ?? null,
                createdAt: now,
                updatedAt: now,
              } satisfies CourseAssignmentPayload,
            ],
          }));
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not add that work.");
    },
    onSettled: () => invalidateCourses(client),
  });
}

export function useUpdateAssignment(courseId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      assignmentId: string;
      body: UpdateCourseAssignmentBody;
    }) => updateCourseAssignment(courseId, input.assignmentId, input.body),
    async onMutate(input) {
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.course(courseId), coursesKeys.list],
        () => {
          editCourse(client, courseId, (course) => ({
            ...course,
            assignments: course.assignments.map((assignment) =>
              assignment.id === input.assignmentId
                ? {
                    ...assignment,
                    ...input.body,
                    updatedAt: new Date().toISOString(),
                  }
                : assignment,
            ),
          }));
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not save that work.");
    },
    onSettled: () => invalidateCourses(client),
  });
}

export function useDeleteAssignment(courseId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (assignmentId: string) =>
      deleteCourseAssignment(courseId, assignmentId),
    async onMutate(assignmentId) {
      const rollback = await applyOptimistically(
        client,
        [coursesKeys.course(courseId), coursesKeys.list],
        () => {
          editCourse(client, courseId, (course) => ({
            ...course,
            assignments: course.assignments.filter(
              (assignment) => assignment.id !== assignmentId,
            ),
          }));
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not remove that work.");
    },
    onSettled: () => invalidateCourses(client),
  });
}
