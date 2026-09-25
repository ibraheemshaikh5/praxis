import { redirect } from "next/navigation";

import { CoursesApp } from "@/components/courses/courses-app";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <CoursesApp userEmail={user.email ?? null} />;
}
