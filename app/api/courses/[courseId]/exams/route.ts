import {
  jsonCreated,
  parseJson,
  resolveCourseId,
  routeError,
  type CourseRouteContext,
} from "@/lib/api/routes";
import { createExamSchema } from "@/lib/courses/contracts";
import { toCourseExamPayload } from "@/lib/courses/payload";
import { getCoursesService } from "@/lib/courses/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request, context: CourseRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const courseId = await resolveCourseId(context);
    const input = await parseJson(request, createExamSchema);
    const exam = await getCoursesService().createExam(userId, courseId, input);
    return jsonCreated({ exam: toCourseExamPayload(exam) });
  } catch (error) {
    return routeError(error);
  }
}
