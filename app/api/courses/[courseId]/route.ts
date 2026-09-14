import { NextResponse } from "next/server";

import {
  parseJson,
  resolveCourseId,
  routeError,
  type CourseRouteContext,
} from "@/lib/api/routes";
import { updateCourseSchema } from "@/lib/courses/contracts";
import { toBareCourse, toCoursePayload } from "@/lib/courses/payload";
import { getCoursesService } from "@/lib/courses/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET(_request: Request, context: CourseRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const courseId = await resolveCourseId(context);
    const course = await getCoursesService().getCourse(userId, courseId);
    return NextResponse.json({ course: toCoursePayload(course) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: CourseRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const courseId = await resolveCourseId(context);
    const input = await parseJson(request, updateCourseSchema);
    const course = await getCoursesService().updateCourse(
      userId,
      courseId,
      input,
    );
    return NextResponse.json({ course: toCoursePayload(course) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: CourseRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const courseId = await resolveCourseId(context);
    const course = await getCoursesService().deleteCourse(userId, courseId);
    return NextResponse.json({ course: toBareCourse(course) });
  } catch (error) {
    return routeError(error);
  }
}
