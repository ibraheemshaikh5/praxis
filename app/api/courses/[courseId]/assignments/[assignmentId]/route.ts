import { NextResponse } from "next/server";

import {
  parseJson,
  resolveCourseAssignmentIds,
  routeError,
  type CourseAssignmentRouteContext,
} from "@/lib/api/routes";
import { updateAssignmentSchema } from "@/lib/courses/contracts";
import { toCourseAssignmentPayload } from "@/lib/courses/payload";
import { getCoursesService } from "@/lib/courses/runtime";
import { requireAuthenticatedUserId } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  context: CourseAssignmentRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { courseId, assignmentId } =
      await resolveCourseAssignmentIds(context);
    const input = await parseJson(request, updateAssignmentSchema);
    const assignment = await getCoursesService().updateAssignment(
      userId,
      courseId,
      assignmentId,
      input,
    );
    return NextResponse.json({
      assignment: toCourseAssignmentPayload(assignment),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: CourseAssignmentRouteContext,
) {
  try {
    const userId = await requireAuthenticatedUserId();
    const { courseId, assignmentId } =
      await resolveCourseAssignmentIds(context);
    const assignment = await getCoursesService().deleteAssignment(
      userId,
      courseId,
      assignmentId,
    );
    return NextResponse.json({
      assignment: toCourseAssignmentPayload(assignment),
    });
  } catch (error) {
    return routeError(error);
  }
}
