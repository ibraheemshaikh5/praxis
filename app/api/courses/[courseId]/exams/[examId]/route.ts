import { NextResponse } from "next/server";

import {
  parseJson,
  resolveCourseExamIds,
  routeError,
  type CourseExamRouteContext,
} from "@/lib/api/routes";
import { updateExamSchema } from "@/lib/courses/contracts";
import { toCourseExamPayload } from "@/lib/courses/payload";
import { getCoursesService } from "@/lib/courses/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: CourseExamRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { courseId, examId } = await resolveCourseExamIds(context);
    const input = await parseJson(request, updateExamSchema);
    const exam = await getCoursesService().updateExam(
      userId,
      courseId,
      examId,
      input,
    );
    return NextResponse.json({ exam: toCourseExamPayload(exam) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: CourseExamRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { courseId, examId } = await resolveCourseExamIds(context);
    const exam = await getCoursesService().deleteExam(userId, courseId, examId);
    return NextResponse.json({ exam: toCourseExamPayload(exam) });
  } catch (error) {
    return routeError(error);
  }
}
