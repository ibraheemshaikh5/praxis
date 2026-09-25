import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { CourseDetail } from "@/components/courses/course-detail";
import { toCoursePayload } from "@/lib/courses/payload";
import { getCoursesService } from "@/lib/courses/runtime";
import { NotFoundError } from "@/lib/daily-planner/errors";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { courseId } = await params;
  if (!z.string().uuid().safeParse(courseId).success) notFound();

  const course = await loadCourse(user.id, courseId);
  if (!course) notFound();

  return (
    <CourseDetail
      initialCourse={toCoursePayload(course)}
      userEmail={user.email ?? null}
    />
  );
}

async function loadCourse(userId: string, courseId: string) {
  try {
    return await getCoursesService().getCourse(userId, courseId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
