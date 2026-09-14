import {
  jsonCreated,
  parseJson,
  resolveCourseId,
  routeError,
  type CourseRouteContext,
} from "@/lib/api/routes";
import { createAssignmentSchema } from "@/lib/courses/contracts";
import { toCourseAssignmentPayload } from "@/lib/courses/payload";
import { getCoursesService } from "@/lib/courses/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request, context: CourseRouteContext) {
  try {
    const userId = await requireAuthenticatedUserId();
    const courseId = await resolveCourseId(context);
    const input = await parseJson(request, createAssignmentSchema);
    const assignment = await getCoursesService().createAssignment(
      userId,
      courseId,
      input,
    );
    return jsonCreated({ assignment: toCourseAssignmentPayload(assignment) });
  } catch (error) {
    return routeError(error);
  }
}
