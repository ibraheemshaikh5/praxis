import { NextResponse } from "next/server";

import { jsonCreated, parseJson, routeError } from "@/lib/api/routes";
import { createCourseSchema } from "@/lib/courses/contracts";
import { toCoursePayload } from "@/lib/courses/payload";
import { getCoursesService } from "@/lib/courses/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();
    const courses = await getCoursesService().listCourses(userId);
    return NextResponse.json({ courses: courses.map(toCoursePayload) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId();
    const input = await parseJson(request, createCourseSchema);
    const course = await getCoursesService().createCourse(userId, input);
    return jsonCreated({ course: toCoursePayload(course) });
  } catch (error) {
    return routeError(error);
  }
}
