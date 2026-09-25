"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { CourseCard } from "@/components/courses/course-card";
import { CourseFormDialog } from "@/components/courses/course-form-dialog";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourses, useCreateCourse } from "@/hooks/use-courses";
import { useToday } from "@/hooks/use-today";
import { signOut } from "@/lib/auth/actions";

export function CoursesApp({ userEmail }: { userEmail: string | null }) {
  const router = useRouter();
  const { data, isError, isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const today = useToday();
  const [adding, setAdding] = React.useState(false);

  const courses = data?.courses ?? [];

  return (
    <AppShell onSignOut={signOut} title="Classes" userEmail={userEmail}>
      <div className="py-8 lg:py-10">
        <header className="mb-10 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus />
            Add class
          </Button>
        </header>

        {isLoading ? (
          <div
            aria-label="Loading classes"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="status"
          >
            {[0, 1, 2, 3].map((index) => (
              <Skeleton className="h-36 rounded-2xl" key={index} />
            ))}
            <span className="sr-only">Loading classes</span>
          </div>
        ) : null}

        {!isLoading && isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load your classes. Try again shortly.
          </p>
        ) : null}

        {!isLoading && !isError && courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes yet.</p>
        ) : null}

        {courses.length > 0 ? (
          <div className="grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((course) => (
              <CourseCard course={course} key={course.id} today={today} />
            ))}
          </div>
        ) : null}
      </div>

      <CourseFormDialog
        course={null}
        onOpenChange={setAdding}
        onSubmit={(values) =>
          createCourse.mutate(values, {
            onSuccess: (result) => {
              setAdding(false);
              router.push(`/classes/${result.course.id}`);
            },
          })
        }
        open={adding}
        pending={createCourse.isPending}
      />
    </AppShell>
  );
}
