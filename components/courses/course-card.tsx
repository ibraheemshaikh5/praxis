"use client";

import Link from "next/link";

import { CourseColorDot } from "@/components/courses/course-color";
import type { CoursePayload } from "@/lib/api/types";
import { dateRangeLabel, nextExam } from "@/lib/courses/format";
import { formatCalendarDate } from "@/lib/rolodex/dates";

export function CourseCard({
  course,
  today,
}: {
  course: CoursePayload;
  today: string | null;
}) {
  const upcoming = nextExam(course.exams, today);
  const recurring = course.assignments.length;

  return (
    <article className="group">
      <Link
        className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
        href={`/classes/${course.id}`}
      >
        <div className="flex items-center gap-2.5">
          <CourseColorDot className="size-3" colorKey={course.colorKey} />
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-medium">{course.name}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {course.term}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {dateRangeLabel(course.startsOn, course.endsOn)}
        </p>

        <dl className="mt-auto grid gap-1 pt-1 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Next exam</dt>
            <dd className="line-clamp-1 text-right">
              {upcoming
                ? `${upcoming.title} · ${formatCalendarDate(upcoming.examOn)}`
                : "None"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Recurring work</dt>
            <dd className="tabular-nums">{recurring}</dd>
          </div>
        </dl>
      </Link>
    </article>
  );
}
